/**
 * Сверка физических констант в db/seed.json с NIST CODATA.
 *
 * Источник: https://physics.nist.gov/cuu/Constants/Table/allascii.txt
 * (машиночитаемая таблица: Quantity / Value / Uncertainty / Unit,
 * колонки разделены 2+ пробелами, внутри чисел — одиночные пробелы
 * как разделители групп, "..." — обрезанное точное значение).
 *
 * Использование:
 *   node scripts/fetch-codata.mjs            # dry-run: отчёт о расхождениях
 *   node scripts/fetch-codata.mjs --write    # применить value/kind в seed.json
 *   npm run codata [-- --write]
 *
 * Обновляет только value/kind у смаппленных имён; unit/labels/hints/sources
 * (ручные подписи) не трогает. Если значение изменилось — hint с
 * неопределённостью станет stale: скрипт печатает предупреждение.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CODATA_URL = 'https://physics.nist.gov/cuu/Constants/Table/allascii.txt';

/** NIST Quantity → имя в scope движка (db/seed.json constants[].name). */
export const NAME_MAP = {
  'speed of light in vacuum': 'c_light',
  'vacuum mag. permeability': 'mu_0',
  'vacuum electric permittivity': 'eps_0',
  'Planck constant': 'h_planck',
  'reduced Planck constant': 'hbar',
  'Boltzmann constant': 'k_B',
  'elementary charge': 'q_e',
  'Avogadro constant': 'N_A',
  'Newtonian constant of gravitation': 'G_const',
  'electron mass': 'm_e',
  'proton mass': 'm_p',
  'neutron mass': 'm_n',
  'atomic mass constant': 'u_mass',
  'fine-structure constant': 'alpha',
  'inverse fine-structure constant': 'alpha_inv',
  'Bohr magneton': 'mu_B',
  'nuclear magneton': 'mu_N',
  'Rydberg constant': 'R_inf',
  'Bohr radius': 'a0',
  'classical electron radius': 'r_e',
  'Compton wavelength': 'lam_compton',
  'characteristic impedance of vacuum': 'Z_0',
  'Faraday constant': 'F_const',
  'molar gas constant': 'R_gas',
  'Stefan-Boltzmann constant': 'sigma_sb',
};

/** Алиасы: копируют значение эталона (в seed.json отдельными строками). */
export const ALIASES = {
  eta0: 'Z_0',
};

/**
 * Разбор allascii.txt → [{quantity, value, exact, truncated, unit}].
 * value — число (null, если не распарсилось), exact — true для
 * "(exact)" и обрезанных "..." (точные по определению), truncated —
 * значение обрезано ("..."): сид может хранить более точное вычисленное.
 */
export function parseCodata(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^-{20,}/.test(l.trim()));
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const parts = line.split(/\s{2,}/).map((s) => s.trim());
    if (parts.length < 3) continue;
    const [quantity, rawValue, rawUnc, rawUnit = ''] = parts;
    const truncated = rawValue.includes('...');
    const num = rawValue.replace(/\s+/g, '').replace(/\.\.\./g, '');
    const value = num === '' ? null : Number(num);
    const exact = rawUnc === '(exact)' || truncated;
    out.push({
      quantity,
      value: Number.isFinite(value) ? value : null,
      exact,
      truncated,
      unit: rawUnit.trim(),
    });
  }
  return out;
}

/** Относительное расхождение; null — несравнимо. */
export function relDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === 0 && b === 0) return 0;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
}

function loadSeed(seedPath) {
  return JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
}

/** Хирургическая замена value/kind внутри записи name (форматирование файла не едет). */
function patchEntry(src, name, value, kind) {
  const anchor = `"name": "${name}"`;
  const i = src.indexOf(anchor);
  if (i < 0) return { src, changed: false };
  const nextAnchor = src.indexOf('"name": "', i + anchor.length);
  const end = nextAnchor < 0 ? src.length : nextAnchor;
  let chunk = src.slice(i, end);
  const before = chunk;
  chunk = chunk.replace(/("value":\s*)[^,\n]+/, `$1${value}`);
  chunk = chunk.replace(/("kind":\s*)"[a-z]+"/, `$1"${kind}"`);
  if (chunk === before) return { src, changed: false };
  return { src: src.slice(0, i) + chunk + src.slice(end), changed: true };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..');
  const seedPath = path.join(root, 'db', 'seed.json');

  console.log(`fetch ${CODATA_URL}`);
  const res = await fetch(CODATA_URL);
  if (!res.ok) throw new Error(`NIST responded HTTP ${res.status}`);
  const rows = parseCodata(await res.text());
  console.log(`parsed ${rows.length} rows`);
  const byQuantity = new Map(rows.map((r) => [r.quantity, r]));

  const seed = loadSeed(seedPath);
  const byName = new Map(seed.constants.map((c) => [c.name, c]));
  let src = fs.readFileSync(seedPath, 'utf-8');

  const report = [];
  const apply = (name, nist) => {
    const cur = byName.get(name);
    if (!cur) {
      report.push(`SKIP ${name}: нет в seed.json`);
      return;
    }
    if (nist.value === null) {
      report.push(`SKIP ${name}: не распарсилось значение NIST`);
      return;
    }
    const kind = nist.exact ? 'exact' : 'measured';
    const d = relDiff(cur.value, nist.value);
    // Усечённый NIST ("...") + сид с полным вычисленным значением
    // (h/2π, N_A·e): даунгрейд запрещён, проверяем согласованность.
    if (nist.truncated && d !== null && d < 1e-9) {
      report.push(`OK   ${name}: seed refines truncated NIST (${cur.value})`);
      return;
    }
    const same = d !== null && d < 1e-12 && cur.kind === kind;
    report.push(`${same ? 'OK  ' : 'DIFF'} ${name}: seed=${cur.value} nist=${nist.value} kind ${cur.kind}->${kind}`);
    if (!same) {
      if (write) {
        const r = patchEntry(src, name, String(nist.value), kind);
        src = r.src;
        report[report.length - 1] += r.changed ? ' [patched]' : ' [PATCH FAILED]';
      } else {
        report[report.length - 1] += ' (запустите с --write)';
      }
      if (cur.hint_ru || cur.hint_en) {
        report.push(`WARN ${name}: hint содержит старое значение — обновите вручную`);
      }
    }
  };

  for (const [quantity, name] of Object.entries(NAME_MAP)) {
    const nist = byQuantity.get(quantity);
    if (!nist) {
      report.push(`SKIP ${name}: нет строки "${quantity}" в ответе NIST`);
      continue;
    }
    apply(name, nist);
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    const t = byName.get(target);
    const a = byName.get(alias);
    if (!t || !a) {
      report.push(`SKIP ${alias}: нет пары в seed.json`);
      continue;
    }
    const same = a.value === t.value;
    report.push(`${same ? 'OK  ' : 'DIFF'} ${alias}: alias of ${target} (${a.value} vs ${t.value})`);
    if (!same && write) {
      const r = patchEntry(src, alias, String(t.value), t.kind);
      src = r.src;
      report[report.length - 1] += r.changed ? ' [patched]' : ' [PATCH FAILED]';
    }
  }

  console.log(report.join('\n'));
  const diffs = report.filter((l) => l.startsWith('DIFF')).length;
  if (write && diffs > 0) {
    fs.writeFileSync(seedPath, src);
    console.log(`seed.json updated (${diffs} diffs). Затем: npm run seed && npm run test`);
  } else if (!write && diffs > 0) {
    process.exitCode = 2;
  } else {
    console.log('seed.json matches NIST CODATA');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`fetch-codata: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
