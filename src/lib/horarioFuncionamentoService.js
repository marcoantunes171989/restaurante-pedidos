// ════════════════════════════════════════════════════════════
//  Horário de funcionamento — serviço de domínio (puro, testável)
//
//  Fonte única de verdade: tab_lojas.funcionamento (JSONB), editável apenas no
//  Cadastro da Empresa → Operação. Suporta:
//    • canais "interno" e "externo";
//    • flag `unificado` (mesma grade para os dois canais);
//    • múltiplos intervalos por dia;
//    • virada de meia-noite (ex.: 18:00 → 02:00);
//    • timezone da loja (não o do navegador).
//
//  NÃO calcular aberto/fechado no JSX — usar estas funções. Sem dependências.
//  Compatível com o legado config_externo.horarios ("HH:MM–HH:MM" por dia,
//  canal externo) via normalização/fallback.
// ════════════════════════════════════════════════════════════

export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
export const DIAS_ROTULO = { dom: "Domingo", seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado" };
export const CANAIS = ["interno", "externo"];
export const TIMEZONE_PADRAO = "America/Sao_Paulo";

const HHMM = /^\d{1,2}:\d{2}$/;
export function horaValida(hm) {
  if (!HHMM.test(String(hm || ""))) return false;
  const [h, m] = String(hm).split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
export function minutosDe(hm) { const [h, m] = String(hm).split(":").map(Number); return h * 60 + (m || 0); }

// Grade vazia (todos os dias fechados).
export function gradeVazia() { return DIAS.reduce((o, d) => { o[d] = []; return o; }, {}); }

// Converte o legado (string "HH:MM–HH:MM" ou "HH:MM-HH:MM" por dia) → grade de intervalos.
export function gradeDoLegado(horariosLegado) {
  const g = gradeVazia();
  if (!horariosLegado) return g;
  for (const dia of DIAS) {
    const faixa = String(horariosLegado[dia] || "").trim();
    if (!/\d/.test(faixa)) continue;
    const [abre, fecha] = faixa.split(/[–-]/).map((s) => (s || "").trim());
    if (horaValida(abre) && horaValida(fecha)) g[dia] = [{ abre, fecha }];
  }
  return g;
}

// Normaliza um objeto `funcionamento` cru (do banco/form) para a forma canônica.
export function normalizarFuncionamento(raw = {}, legadoExterno = null) {
  const f = raw || {};
  const norm = (grade) => {
    const g = gradeVazia();
    if (!grade) return g;
    for (const dia of DIAS) {
      const arr = Array.isArray(grade[dia]) ? grade[dia] : [];
      g[dia] = arr
        .filter((iv) => iv && horaValida(iv.abre) && horaValida(iv.fecha))
        .map((iv) => ({ abre: iv.abre, fecha: iv.fecha }));
    }
    return g;
  };
  const externoBase = f.externo ? norm(f.externo) : (legadoExterno ? gradeDoLegado(legadoExterno) : gradeVazia());
  return {
    unificado: f.unificado === true,
    timezone: (typeof f.timezone === "string" && f.timezone.trim()) || TIMEZONE_PADRAO,
    bloquearForaHorario: f.bloquearForaHorario !== false, // default true
    permitirVisualizarForaHorario: f.permitirVisualizarForaHorario !== false, // default true
    interno: norm(f.interno),
    externo: externoBase,
  };
}

// Grade EFETIVA de um canal: quando unificado, os dois canais usam a grade
// interna — divergência é impossível na leitura.
export function gradeDoCanal(func, canal) {
  const f = normalizarFuncionamento(func);
  if (f.unificado) return f.interno;
  return canal === "externo" ? f.externo : f.interno;
}

// ── Validação de uma grade (por dia → intervalos) ──────────
// Retorna { ok, erros: { "dia:idx": msg | "dia": msg } }.
export function validarGrade(grade) {
  const erros = {};
  for (const dia of DIAS) {
    const arr = Array.isArray(grade?.[dia]) ? grade[dia] : [];
    const janelas = []; // {ini, fim, cruzaMeiaNoite}
    arr.forEach((iv, idx) => {
      const chave = `${dia}:${idx}`;
      if (!horaValida(iv.abre) || !horaValida(iv.fecha)) { erros[chave] = "Informe um horário válido."; return; }
      if (iv.abre === iv.fecha) { erros[chave] = "Horário final deve ser diferente do inicial."; return; }
      const ini = minutosDe(iv.abre), fim = minutosDe(iv.fecha);
      janelas.push({ ini, fim, cruza: fim < ini, idx });
    });
    // Sobreposição no mesmo dia (trata virada de meia-noite expandindo em 2 segmentos).
    const segmentos = [];
    for (const j of janelas) {
      if (j.cruza) { segmentos.push({ a: j.ini, b: 1440, idx: j.idx }); segmentos.push({ a: 0, b: j.fim, idx: j.idx }); }
      else segmentos.push({ a: j.ini, b: j.fim, idx: j.idx });
    }
    for (let i = 0; i < segmentos.length; i++) {
      for (let k = i + 1; k < segmentos.length; k++) {
        if (segmentos[i].idx === segmentos[k].idx) continue;
        if (segmentos[i].a < segmentos[k].b && segmentos[k].a < segmentos[i].b) {
          const alvo = Math.max(segmentos[i].idx, segmentos[k].idx);
          erros[`${dia}:${alvo}`] = "Este intervalo sobrepõe outro horário do mesmo dia.";
        }
      }
    }
  }
  return { ok: Object.keys(erros).length === 0, erros };
}

// ── Timezone: dia da semana + minutos-do-dia no fuso da LOJA ──
export function diaEHoraNoFuso(fuso, base = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: fuso || TIMEZONE_PADRAO, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    const p = {}; fmt.formatToParts(base).forEach((x) => (p[x.type] = x.value));
    const idx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
    return { diaIdx: idx, dia: DIAS[idx], minutos: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  } catch {
    const idx = base.getDay();
    return { diaIdx: idx, dia: DIAS[idx], minutos: base.getHours() * 60 + base.getMinutes() };
  }
}

// Um intervalo está ativo no minuto `nowMin`? (trata virada de meia-noite)
function intervaloAtivo(iv, nowMin) {
  const a = minutosDe(iv.abre), b = minutosDe(iv.fecha);
  return b > a ? (nowMin >= a && nowMin < b) : (nowMin >= a || nowMin < b);
}

// Avaliação completa do funcionamento de um canal.
// Retorna { aberto, canal, timezone, intervaloAtual, proximaAbertura, motivo }.
export function avaliarFuncionamentoLoja(func, canal = "externo", agora = new Date()) {
  const f = normalizarFuncionamento(func);
  const grade = gradeDoCanal(f, canal);
  const { diaIdx, dia, minutos } = diaEHoraNoFuso(f.timezone, agora);

  // Intervalo ativo hoje? (inclui intervalo que começou ontem e cruzou a meia-noite)
  const hojeArr = grade[dia] || [];
  const intervaloAtual = hojeArr.find((iv) => intervaloAtivo(iv, minutos)) || null;
  // intervalo iniciado ONTEM que cruzou a meia-noite e ainda cobre agora
  const ontemDia = DIAS[(diaIdx + 6) % 7];
  const cruzouDeOntem = (grade[ontemDia] || []).find((iv) => minutosDe(iv.fecha) < minutosDe(iv.abre) && minutos < minutosDe(iv.fecha)) || null;
  const aberto = !!(intervaloAtual || cruzouDeOntem);

  const prox = proximaAbertura(f, canal, agora);
  return {
    aberto, canal, timezone: f.timezone,
    intervaloAtual: intervaloAtual || cruzouDeOntem || null,
    proximaAbertura: prox,
    bloquearForaHorario: f.bloquearForaHorario,
    permitirVisualizarForaHorario: f.permitirVisualizarForaHorario,
    motivo: aberto ? "aberto" : (temAlgumHorario(grade) ? "fora-horario" : "sem-configuracao"),
  };
}

export function estaAbertoAgora(func, canal = "externo", agora = new Date()) {
  return avaliarFuncionamentoLoja(func, canal, agora).aberto;
}

function temAlgumHorario(grade) { return DIAS.some((d) => (grade[d] || []).length > 0); }

// Próxima abertura a partir de agora — varre até 7 dias. Retorna { dia, diaRotulo, hora, emDias } ou null.
export function proximaAbertura(func, canal = "externo", agora = new Date()) {
  const f = normalizarFuncionamento(func);
  const grade = gradeDoCanal(f, canal);
  if (!temAlgumHorario(grade)) return null;
  const { diaIdx, minutos } = diaEHoraNoFuso(f.timezone, agora);
  for (let salto = 0; salto <= 7; salto++) {
    const idx = (diaIdx + salto) % 7;
    const dia = DIAS[idx];
    const abrindo = (grade[dia] || [])
      .map((iv) => minutosDe(iv.abre))
      .filter((a) => salto > 0 || a > minutos)
      .sort((a, b) => a - b);
    if (abrindo.length) {
      const min = abrindo[0];
      const hora = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      return { dia, diaRotulo: DIAS_ROTULO[dia], hora, emDias: salto };
    }
  }
  return null;
}
