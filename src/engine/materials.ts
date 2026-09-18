/**
 * Справочник материалов (электротехника / электроника).
 *
 * Свойства — типичные справочные значения (CRC Handbook of Chemistry and
 * Physics, справочник Кей/Лэби) при 20–25 °C, если не указано иное:
 *  - sigma        удельная электрическая проводимость, См/м
 *  - rho          плотность, кг/м³
 *  - eps_r        относительная диэлектрическая проницаемость (1 МГц)
 *  - mu_r         относительная магнитная проницаемость
 *  - alpha_res    температурный коэффициент сопротивления, 1/К
 *  - melting      температура плавления, °C
 *  - ct           теплопроводность, Вт/(м·К)
 *  - cp           удельная теплоёмкость, Дж/(кг·К)
 *  - bandgap      ширина запрещённой зоны, эВ
 */

export type MaterialType = 'metal' | 'dielectric' | 'semiconductor';

export interface Material {
  id: string;
  en: string;
  ru: string;
  formula: string;
  type: MaterialType;
  props: Partial<Record<MatPropKey, number>>;
}

export const MAT_PROP_KEYS = [
  'sigma',
  'rho',
  'eps_r',
  'mu_r',
  'alpha_res',
  'melting',
  'ct',
  'cp',
  'bandgap',
] as const;

export type MatPropKey = (typeof MAT_PROP_KEYS)[number];

export const MAT_PROP_NAMES: Record<MatPropKey, { ru: string; en: string }> = {
  sigma: { ru: 'проводимость σ, См/м', en: 'conductivity σ, S/m' },
  rho: { ru: 'плотность ρ, кг/м³', en: 'density ρ, kg/m³' },
  eps_r: { ru: 'εᵣ', en: 'εᵣ' },
  mu_r: { ru: 'μᵣ', en: 'μᵣ' },
  alpha_res: { ru: 'ТКС α, 1/К', en: 'TCR α, 1/K' },
  melting: { ru: 'плавление, °C', en: 'melting, °C' },
  ct: { ru: 'теплопроводность, Вт/(м·К)', en: 'thermal conductivity, W/(m·K)' },
  cp: { ru: 'теплоёмкость cₚ, Дж/(кг·К)', en: 'specific heat cₚ, J/(kg·K)' },
  bandgap: { ru: 'ширина зоны E_g, эВ', en: 'bandgap E_g, eV' },
};

export const MATERIALS: Material[] = [
  // --- металлы -----------------------------------------------------------
  { id: 'silver', en: 'Silver', ru: 'Серебро', formula: 'Ag', type: 'metal', props: { sigma: 6.3e7, rho: 10490, alpha_res: 3.8e-3, melting: 961.8, ct: 429, cp: 235 } },
  { id: 'copper', en: 'Copper', ru: 'Медь', formula: 'Cu', type: 'metal', props: { sigma: 5.96e7, rho: 8960, alpha_res: 3.9e-3, melting: 1084.6, ct: 401, cp: 385 } },
  { id: 'gold', en: 'Gold', ru: 'Золото', formula: 'Au', type: 'metal', props: { sigma: 4.10e7, rho: 19320, alpha_res: 3.4e-3, melting: 1064.2, ct: 318, cp: 129 } },
  { id: 'aluminum', en: 'Aluminium', ru: 'Алюминий', formula: 'Al', type: 'metal', props: { sigma: 3.5e7, rho: 2700, alpha_res: 4.0e-3, melting: 660.3, ct: 237, cp: 900 } },
  { id: 'tungsten', en: 'Tungsten', ru: 'Вольфрам', formula: 'W', type: 'metal', props: { sigma: 1.79e7, rho: 19300, alpha_res: 4.5e-3, melting: 3422, ct: 174, cp: 132 } },
  { id: 'zinc', en: 'Zinc', ru: 'Цинк', formula: 'Zn', type: 'metal', props: { sigma: 1.69e7, rho: 7140, alpha_res: 3.7e-3, melting: 419.5, ct: 116, cp: 388 } },
  { id: 'nickel', en: 'Nickel', ru: 'Никель', formula: 'Ni', type: 'metal', props: { sigma: 1.43e7, rho: 8908, mu_r: 100, alpha_res: 5.9e-3, melting: 1455, ct: 91, cp: 445 } },
  { id: 'iron', en: 'Iron', ru: 'Железо', formula: 'Fe', type: 'metal', props: { sigma: 1.0e7, rho: 7874, mu_r: 200, alpha_res: 5.0e-3, melting: 1538, ct: 80, cp: 449 } },
  { id: 'tin', en: 'Tin', ru: 'Олово', formula: 'Sn', type: 'metal', props: { sigma: 9.17e6, rho: 7310, alpha_res: 4.4e-3, melting: 231.9, ct: 67, cp: 227 } },
  { id: 'brass', en: 'Brass (CuZn)', ru: 'Латунь (CuZn)', formula: 'CuZn', type: 'metal', props: { sigma: 1.5e7, rho: 8500, alpha_res: 1.5e-3, melting: 930, ct: 120, cp: 380 } },
  { id: 'nichrome', en: 'Nichrome', ru: 'Нихром', formula: 'NiCr', type: 'metal', props: { sigma: 1.0e6, rho: 8400, alpha_res: 4.0e-4, melting: 1400, ct: 11.3, cp: 450 } },
  { id: 'platinum', en: 'Platinum', ru: 'Платина', formula: 'Pt', type: 'metal', props: { sigma: 9.4e6, rho: 21450, alpha_res: 3.9e-3, melting: 1768.2, ct: 72, cp: 133 } },
  { id: 'lead', en: 'Lead', ru: 'Свинец', formula: 'Pb', type: 'metal', props: { sigma: 4.8e6, rho: 11340, alpha_res: 3.9e-3, melting: 327.5, ct: 35, cp: 129 } },
  { id: 'mercury', en: 'Mercury', ru: 'Ртуть', formula: 'Hg', type: 'metal', props: { sigma: 1.04e6, rho: 13534, melting: -38.83, ct: 8.3, cp: 140 } },
  // --- полупроводники ----------------------------------------------------
  { id: 'silicon', en: 'Silicon', ru: 'Кремний', formula: 'Si', type: 'semiconductor', props: { sigma: 4.3e-4, rho: 2330, eps_r: 11.7, melting: 1414, ct: 148, cp: 705, bandgap: 1.12 } },
  { id: 'germanium', en: 'Germanium', ru: 'Германий', formula: 'Ge', type: 'semiconductor', props: { sigma: 2.1, rho: 5323, eps_r: 16.2, melting: 938.3, ct: 60, cp: 320, bandgap: 0.66 } },
  { id: 'gaas', en: 'Gallium arsenide', ru: 'Арсенид галлия', formula: 'GaAs', type: 'semiconductor', props: { sigma: 1e-6, rho: 5318, eps_r: 12.9, melting: 1238, ct: 55, cp: 350, bandgap: 1.42 } },
  { id: 'gan', en: 'Gallium nitride', ru: 'Нитрид галлия', formula: 'GaN', type: 'semiconductor', props: { sigma: 1e-10, rho: 6150, eps_r: 9.5, melting: 2500, ct: 130, cp: 490, bandgap: 3.4 } },
  { id: 'sic', en: 'Silicon carbide', ru: 'Карбид кремния', formula: 'SiC', type: 'semiconductor', props: { sigma: 1e-5, rho: 3210, eps_r: 9.7, melting: 2730, ct: 490, cp: 670, bandgap: 3.26 } },
  { id: 'diamond', en: 'Diamond', ru: 'Алмаз', formula: 'C', type: 'semiconductor', props: { sigma: 1e-15, rho: 3510, eps_r: 5.7, melting: 3550, ct: 2200, cp: 510, bandgap: 5.47 } },
  // --- диэлектрики -------------------------------------------------------
  { id: 'ptfe', en: 'PTFE (Teflon)', ru: 'Фторопласт (PTFE)', formula: 'C2F4', type: 'dielectric', props: { eps_r: 2.1, rho: 2200, melting: 327, ct: 0.25, cp: 1000 } },
  { id: 'polyethylene', en: 'Polyethylene', ru: 'Полиэтилен', formula: 'PE', type: 'dielectric', props: { eps_r: 2.25, rho: 930, melting: 130, ct: 0.38, cp: 1900 } },
  { id: 'polypropylene', en: 'Polypropylene', ru: 'Полипропилен', formula: 'PP', type: 'dielectric', props: { eps_r: 2.2, rho: 900, melting: 160, ct: 0.22, cp: 1800 } },
  { id: 'pvc', en: 'PVC', ru: 'ПВХ', formula: 'PVC', type: 'dielectric', props: { eps_r: 3.2, rho: 1400, melting: 160, ct: 0.19, cp: 1000 } },
  { id: 'kapton', en: 'Kapton (PI)', ru: 'Каптон (PI)', formula: 'PI', type: 'dielectric', props: { eps_r: 3.5, rho: 1420, melting: 285, ct: 0.12, cp: 1090 } },
  { id: 'epoxy', en: 'Epoxy resin', ru: 'Эпоксидная смола', formula: 'EP', type: 'dielectric', props: { eps_r: 3.6, rho: 1200, melting: 120, ct: 0.2, cp: 1200 } },
  { id: 'fr4', en: 'FR-4 laminate', ru: 'Стеклотекстолит FR-4', formula: 'FR4', type: 'dielectric', props: { eps_r: 4.4, rho: 1850, melting: 320, ct: 0.3, cp: 1300 } },
  { id: 'glass', en: 'Borosilicate glass', ru: 'Стекло (боросиликатное)', formula: 'SiO2', type: 'dielectric', props: { eps_r: 4.7, rho: 2230, melting: 820, ct: 1.1, cp: 830 } },
  { id: 'fused_silica', en: 'Fused silica', ru: 'Кварцевое стекло', formula: 'SiO2', type: 'dielectric', props: { eps_r: 3.9, rho: 2200, melting: 1650, ct: 1.4, cp: 740 } },
  { id: 'alumina', en: 'Alumina (Al2O3)', ru: 'Алюмооксидная керамика', formula: 'Al2O3', type: 'dielectric', props: { eps_r: 9.8, rho: 3950, melting: 2072, ct: 30, cp: 880 } },
  { id: 'mica', en: 'Mica', ru: 'Слюда (мусковит)', formula: 'KAl2', type: 'dielectric', props: { eps_r: 6.5, rho: 2800, melting: 1300, ct: 0.7, cp: 880 } },
  { id: 'water', en: 'Water', ru: 'Вода (дистиллированная)', formula: 'H2O', type: 'dielectric', props: { eps_r: 80, rho: 998, melting: 0, ct: 0.6, cp: 4186 } },
];

/** Нормализация поискового запроса: нижний регистр, без пробелов/дефисов. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');

export function findMaterial(q: string): Material | null {
  const nq = norm(q);
  if (!nq) return null;
  let partial: Material | null = null;
  for (const m of MATERIALS) {
    const keys = [m.id, m.en, m.ru, m.formula].map(norm);
    for (const k of keys) {
      if (!k) continue;
      if (k === nq) return m;
      if (!partial && k.startsWith(nq)) partial = m;
    }
  }
  return partial;
}