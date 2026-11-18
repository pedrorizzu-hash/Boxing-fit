/**
 * Boxing Fit · sincronização com Google Sheets
 * Cole este código em: planilha "Boxing Fit · Progresso" → Extensões → Apps Script.
 * 1. Troque a CHAVE abaixo pela chave gerada no app (Evolução → Google Sheets → Gerar chave).
 * 2. Implantar → Nova implantação → Tipo: App da Web → Executar como: Eu → Quem pode acessar: Qualquer pessoa.
 * 3. Copie a URL do app da Web e cole no Boxing Fit.
 */
const CHAVE = 'COLE_AQUI_A_CHAVE_DO_APP';

const ABA_TREINOS = 'Treinos';
const ABA_PERFIL = 'Perfil';
const ABA_CLAUDE = 'Leia-me (Claude)';
const COLUNAS = ['id', 'data', 'hora', 'tipo', 'treino', 'jornada', 'aula', 'golpe aprendido', 'minutos', 'esforço (1-10)', 'carga', 'combinações chamadas', 'dores', 'kcal estimadas', 'golpes aprendidos (total)', 'sequência', 'base', 'objetivo'];

function doGet() {
  return json_({ ok: true, app: 'boxing-fit-sheets', versao: 1 });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erro: 'JSON inválido' }); }
  if (!body || body.chave !== CHAVE || CHAVE === 'COLE_AQUI_A_CHAVE_DO_APP') return json_({ ok: false, erro: 'Chave inválida' });
  if (body.acao === 'ping') { prepara_(); return json_({ ok: true, ping: true }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    prepara_();
    const added = gravaTreinos_(body.treinos || []);
    if (body.perfil) gravaPerfil_(body.perfil);
    return json_({ ok: true, adicionados: added });
  } finally { lock.releaseLock(); }
}

function prepara_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ABA_TREINOS);
  if (!sh) {
    const first = ss.getSheets()[0];
    sh = first.getLastRow() === 0 && first.getName() !== ABA_PERFIL ? first.setName(ABA_TREINOS) : ss.insertSheet(ABA_TREINOS);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUNAS);
    sh.getRange(1, 1, 1, COLUNAS.length).setFontWeight('bold').setBackground('#ffc94e');
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName(ABA_PERFIL)) ss.insertSheet(ABA_PERFIL);
  if (!ss.getSheetByName(ABA_CLAUDE)) {
    const r = ss.insertSheet(ABA_CLAUDE);
    r.getRange(1, 1, 8, 1).setValues([
      ['Instruções para o Claude avaliar o progresso no boxe'],
      ['Aba Treinos: uma linha por treino concluído no app Boxing Fit (shadow boxing em casa, sem saco).'],
      ['Esforço = percepção de esforço da sessão (1 a 10). Carga = minutos × esforço.'],
      ['Tipo: aula (jornada de aprendizado), quick (treino rápido) ou custom (montado pelo usuário).'],
      ['Aba Perfil: estado atual (objetivo, experiência, dias de treino, jornada, golpes aprendidos, dores ativas).'],
      ['Ao avaliar: frequência versus dias planejados, evolução da carga semanal (alerta acima de +30%), tendência do esforço, dores recorrentes, ritmo das aulas e próximos focos técnicos.'],
      ['Numeração: 1 jab, 2 direto, 3 cruzado da frente, 4 cruzado de trás, 5 uppercut da frente, 6 uppercut de trás.'],
      ['Dados enviados automaticamente pelo app; não edite a coluna id.'],
    ]);
    r.setColumnWidth(1, 900);
  }
}

function gravaTreinos_(treinos) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_TREINOS);
  const last = sh.getLastRow();
  const ids = new Set(last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : []);
  const rows = [];
  treinos.forEach(t => {
    if (!t || !t.id || ids.has(String(t.id))) return;
    ids.add(String(t.id));
    rows.push(COLUNAS.map(c => t[c] === undefined || t[c] === null ? '' : t[c]));
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, COLUNAS.length).setValues(rows);
    const n = sh.getLastRow();
    if (n > 2) sh.getRange(2, 1, n - 1, COLUNAS.length).sort({ column: 1, ascending: true });
  }
  return rows.length;
}

function gravaPerfil_(perfil) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_PERFIL);
  sh.clear();
  const rows = [['campo', 'valor']].concat(Object.keys(perfil).map(k => [k, Array.isArray(perfil[k]) ? perfil[k].join(', ') : String(perfil[k])]));
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#ffc94e');
  sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 520);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
