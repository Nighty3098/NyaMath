/** Smoke-тест MCP-сервера через настоящий Client + stdio transport. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, '../dist/index.js');

const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(transport);

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  return { isError: !!r.isError, data: JSON.parse(text) };
};

let pass = 0;
const check = (cond, label) => {
  assert.ok(cond, `FAIL: ${label}`);
  pass++;
  console.log(`ok: ${label}`);
};

// 1. tools list
const { tools } = await client.listTools();
check(tools.length >= 14, `tools listed (${tools.length})`);

// 2. load variant20
let r = await call('nya_load_example', { name: 'variant20' });
check(r.data.blocks > 30 && r.data.errors === 0, `variant20 loaded: ${r.data.blocks} blocks, ${r.data.errors} errors`);

// 3. status + scope: ключевые переменные варианта
r = await call('nya_get_scope');
check(r.data.variables['Z_c_abs']?.startsWith('207.5'), `Z_c_abs = ${r.data.variables['Z_c_abs']}`);
check(r.data.variables['eps_check'] === '3.3', `eps_check = ${r.data.variables['eps_check']}`);

// 4. evaluate в scope документа
r = await call('nya_evaluate', { expression: 'sqrt(Re(Z_c)^2 + Im(Z_c)^2)' });
check(!r.data.error && r.data.formatted.startsWith('207.5'), `evaluate Re/Im = ${r.data.formatted}`);

// 5. math-блок с автографиком
r = await call('nya_add_block', { kind: 'math', x: 80, y: 3000, rawInput: 'sin(x) =' });
check(!r.data.error && r.data.hasPlot, 'auto-plot on sin(x) =');
const autoId = r.data.id;

// 6. данные автографика
r = await call('nya_get_plot_data', { id: autoId, max_points: 50 });
check(r.data.kind === 'preview' && r.data.xs.length === 50 && r.data.ys.length === 50, `preview data 50 pts, label=${r.data.label}`);

// 7. plot-блок + его данные
r = await call('nya_add_block', { kind: 'plot', x: 600, y: 200, rawInput: 'plot', plotFn: 'sin(x); cos(x/2)', plotXmin: -10, plotXmax: 10 });
const plotId = r.data.id;
r = await call('nya_get_plot_data', { id: plotId, max_points: 60 });
check(r.data.series.length === 2 && r.data.series[0].xs.length === 60, `plot series x2, 60 pts, ymin=${Number(r.data.ymin).toFixed(2)}`);

// 8. move + update + resize + get
r = await call('nya_move_block', { id: autoId, x: 100, y: 3100 });
check(r.data.x === 100 && r.data.y === 3100, 'move block');
r = await call('nya_update_block', { id: autoId, rawInput: 'cos(x) =' });
check(!r.data.error && r.data.hasPlot, 'update to cos(x)');
r = await call('nya_resize_block', { id: plotId, w: 600, h: 500 });
check(r.data.id === plotId, 'resize plot');
r = await call('nya_get_block', { id: plotId });
check(r.data.w === 600 && r.data.h === 500, 'get resized plot');

// 9. program-блок: сначала без n выше → ошибка; добавим n выше → факториал
let prog = await call('nya_add_block', { kind: 'program', x: 80, y: 3200, rawInput: 'f := 1\nfor i in 2..n\n  f := f*i\nend\nf' });
check(!!prog.data.error, `program errors without n (got: ${(prog.data.error || '').slice(0, 50)})`);
await call('nya_add_block', { kind: 'math', x: 80, y: 50, rawInput: 'n := 7' });
prog = await call('nya_get_block', { id: prog.data.id });
check(!prog.data.error && prog.data.resultStr === '5040', `factorial = ${prog.data.resultStr}`);

// 10. save + open roundtrip
const tmp = '/tmp/opencode/nya-smoke.json';
r = await call('nya_save', { path: tmp });
check(r.data.ok && r.data.blocks > 30, `saved ${r.data.blocks} blocks`);
await call('nya_clear', { confirm: true });
r = await call('nya_status');
check(r.data.blocks === 0, 'cleared');
r = await call('nya_open', { path: tmp });
check(r.data.blocks > 30, `reopened ${r.data.blocks} blocks`);
r = await call('nya_get_scope');
check(r.data.variables['Z_c_abs']?.startsWith('207.5'), 'scope survives roundtrip');

// 11. remove
const lst = await call('nya_list_blocks', { kind: 'plot' });
await call('nya_remove_block', { id: lst.data.blocks[0].id });
r = await call('nya_status');
check(true, 'remove ok');

// 12. resource
const res = await client.readResource({ uri: 'nya://document' });
check(res.contents[0].text.includes('Z_c_abs') || res.contents[0].text.length > 100, 'resource nya://document');

// 13. ask/answer: вопрос пользователю + запись ответа в переменную
const ask = await call('nya_ask', { question: 'Какое напряжение питания?', options: ['5', '12', '24'], var: 'Vcc' });
check(ask.data.ok && ask.data.kind === 'ask' && ask.data.question.includes('напряжение'), `ask registered (${ask.data.id})`);
let st = await call('nya_status');
check(st.data.pendingAsks === 1, `pendingAsks = ${st.data.pendingAsks}`);
let bad = await call('nya_answer', { id: ask.data.id, answer: '48' });
check(!!bad.isError && bad.data.error.includes('5 / 12 / 24'), `ask rejects unknown option: ${bad.data.error}`);
const ok = await call('nya_answer', { id: ask.data.id, answer: '12' });
check(ok.data.answer === '12' && ok.data.var.value === '12', `ask answered, Vcc=${ok.data.var?.value}`);
st = await call('nya_status');
check(st.data.pendingAsks === 0 && st.data.blocks > 30, `ask resolved, pending=${st.data.pendingAsks}`);
r = await call('nya_get_scope');
check(r.data.variables['Vcc'] === '12', `Vcc in scope = ${r.data.variables['Vcc']}`);
r = await call('nya_ask', { question: 'Замечание к расчёту?', var: 'note' });
const note = await call('nya_answer', { id: r.data.id, answer: 'проверить допуски' });
check(note.data.var.value === 'проверить допуски', `string var in scope: ${note.data.var?.value}`);

console.log(`\nSMOKE PASS: ${pass} checks`);
await client.close();
