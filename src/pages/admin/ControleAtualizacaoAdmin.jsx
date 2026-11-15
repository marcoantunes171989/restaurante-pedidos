import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, LockKeyholeOpen, RefreshCw, Users } from "lucide-react";
import { PageHeader, PrimeButton } from "../../components/Prime";
import {
  buscarStatusControle,
  CONTROLE_ATUALIZACAO_INTERVALO_MS,
  desligarBloqueio,
  ligarBloqueio,
  listarUsuariosOnline,
  MENSAGEM_MAX,
  mensagemErroControle,
  MINUTOS_OPCOES,
} from "../../lib/controleAtualizacao";
import { MANUTENCAO_MENSAGEM_PADRAO, textoPrevisaoRetorno } from "../../lib/sistemaStatus";

// ════════════════════════════════════════════════════════════
//  Painel de Controle de Atualização (/admin/controle-atualizacao)
//  Só super admin. Mostra quem está online e liga/desliga o bloqueio
//  "Sistema em atualização". Com alguém online o bloqueio fica travado
//  (a regra também vale no banco — migration 173).
// ════════════════════════════════════════════════════════════

const SELO = {
  ok: "border-[#5E8C31]/30 bg-[#5E8C31]/10 text-[#3F6420]",
  erro: "border-[#C81E4A]/30 bg-[#C81E4A]/10 text-[#A0173B]",
  neutro: "border-[var(--pp-border)] bg-white text-[var(--pp-text-muted)]",
};

function Selo({ tipo = "neutro", children }) {
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-semibold ${SELO[tipo]}`}>{children}</span>;
}

function formatarHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function ControleAtualizacaoAdmin() {
  const [status, setStatus] = useState(null);
  const [online, setOnline] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [minutos, setMinutos] = useState(15);
  const [atualizadoEm, setAtualizadoEm] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [st, lista] = await Promise.all([buscarStatusControle(), listarUsuariosOnline()]);
      setStatus(st);
      setOnline(lista);
      setErro(null);
      setAtualizadoEm(new Date());
    } catch (e) {
      setErro(mensagemErroControle(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const primeira = setTimeout(carregar, 0);
    const iv = setInterval(carregar, CONTROLE_ATUALIZACAO_INTERVALO_MS);
    return () => { clearTimeout(primeira); clearInterval(iv); };
  }, [carregar]);

  const emManutencao = status?.emManutencao === true;
  const temOnline = online.length > 0;
  const podeBloquear = !carregando && !erro && !emManutencao && !temOnline && !ocupado;

  async function onBloquear() {
    if (!podeBloquear) return;
    const ok = window.confirm(
      `Bloquear o acesso de todos os usuários por até ${minutos} minutos?\n\nSó o administrador geral continua entrando. O cardápio do cliente não é bloqueado.`
    );
    if (!ok) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await ligarBloqueio({ mensagem, minutos });
      if (r.ok) {
        setAviso({ tipo: "sucesso", texto: "Acesso bloqueado. Lembre de desbloquear ao terminar a atualização." });
      } else if (r.motivo === "usuarios_online") {
        setAviso({ tipo: "alerta", texto: `Bloqueio não feito: ${r.online} usuário(s) entraram no sistema agora. Aguarde saírem.` });
      } else {
        setAviso({ tipo: "erro", texto: "O banco não confirmou o bloqueio. Tente de novo." });
      }
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemErroControle(e) });
    } finally {
      setOcupado(false);
      carregar();
    }
  }

  async function onDesbloquear() {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const ok = await desligarBloqueio();
      setAviso(ok
        ? { tipo: "sucesso", texto: "Acesso liberado para todos os usuários." }
        : { tipo: "erro", texto: "O banco não confirmou o desbloqueio. Tente de novo." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemErroControle(e) });
    } finally {
      setOcupado(false);
      carregar();
    }
  }

  const corAviso = {
    sucesso: "border-[#5E8C31]/30 bg-[#5E8C31]/10 text-[#3F6420]",
    alerta: "border-[#F38525]/40 bg-[#F38525]/10 text-[#8A4A10]",
    erro: "border-[#C81E4A]/30 bg-[#C81E4A]/10 text-[#A0173B]",
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icone={<LockKeyhole />}
        titulo="Controle de Atualização"
        descricao="Bloqueie o acesso dos usuários durante uma atualização. Só é possível bloquear quando ninguém estiver usando o sistema."
        acao={(
          <PrimeButton variante="ghost" onClick={carregar} disabled={ocupado}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </PrimeButton>
        )}
      />

      {erro && (
        <div role="alert" className={`rounded-2xl border p-4 text-sm ${corAviso.erro}`}>{erro}</div>
      )}
      {aviso && (
        <div role="status" className={`rounded-2xl border p-4 text-sm ${corAviso[aviso.tipo]}`}>{aviso.texto}</div>
      )}

      <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-[var(--pp-text-muted)]">Situação agora</p>
            <div className="mt-1 flex items-center gap-2">
              {carregando
                ? <Selo tipo="neutro">Carregando…</Selo>
                : emManutencao
                  ? <Selo tipo="erro">Acesso bloqueado</Selo>
                  : <Selo tipo="ok">Acesso liberado</Selo>}
            </div>
            {emManutencao && (
              <p className="mt-2 text-sm text-[var(--pp-text-body)]">
                {textoPrevisaoRetorno(status?.previsaoFim) || "Sem previsão de retorno."}
                {status?.atualizadoPor ? ` · Bloqueado por ${status.atualizadoPor} em ${formatarHora(status.atualizadoEm)}` : ""}
              </p>
            )}
          </div>
          {emManutencao && (
            <PrimeButton onClick={onDesbloquear} disabled={ocupado}>
              <LockKeyholeOpen className="h-4 w-4" /> Desbloquear acesso
            </PrimeButton>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--pp-text)]">
            <Users className="h-4 w-4" /> Usuários online agora
            <span className="text-sm font-normal text-[var(--pp-text-muted)]">({online.length})</span>
          </h2>
          <span className="text-xs text-[var(--pp-text-muted)]">
            {atualizadoEm ? `Atualiza a cada 15 s · ${formatarHora(atualizadoEm.toISOString())}` : ""}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
          Conta quem teve atividade nos últimos 2 minutos. O administrador geral não entra na conta.
        </p>
        {!carregando && !erro && !temOnline && (
          <p className="mt-3 rounded-xl border border-[#5E8C31]/30 bg-[#5E8C31]/10 p-3 text-sm text-[#3F6420]">
            Ninguém online agora. O bloqueio pode ser feito com segurança.
          </p>
        )}
        {temOnline && (
          <ul className="mt-3 divide-y divide-[var(--pp-border)]">
            {online.map((u) => (
              <li key={u.userId} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 truncate font-medium text-[var(--pp-text)]">
                  {u.nome || u.email}
                  {u.loja ? <span className="font-normal text-[var(--pp-text-muted)]"> · {u.loja}</span> : null}
                </span>
                <span className="text-xs text-[var(--pp-text-muted)]">
                  {u.dispositivo ? `${u.dispositivo} · ` : ""}última atividade {formatarHora(u.ultimaAtividade)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!emManutencao && (
        <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-[var(--pp-text)]">Bloquear acesso</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block text-sm">
              <span className="text-[var(--pp-text-muted)]">Mensagem para os usuários (opcional)</span>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value.slice(0, MENSAGEM_MAX))}
                rows={3}
                placeholder={MANUTENCAO_MENSAGEM_PADRAO}
                className="mt-1 w-full rounded-xl border border-[var(--pp-border)] bg-white p-2.5 text-sm text-[var(--pp-text-body)]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--pp-text-muted)]">Previsão de retorno</span>
              <select
                value={minutos}
                onChange={(e) => setMinutos(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[var(--pp-border)] bg-white p-2.5 text-sm text-[var(--pp-text-body)] sm:w-40"
              >
                {MINUTOS_OPCOES.map((m) => <option key={m} value={m}>{m} minutos</option>)}
              </select>
            </label>
          </div>
          {temOnline && (
            <p className="mt-3 rounded-xl border border-[#F38525]/40 bg-[#F38525]/10 p-3 text-sm text-[#8A4A10]">
              Há {online.length} usuário(s) online. O bloqueio só fica disponível quando todos saírem.
            </p>
          )}
          <div className="mt-3">
            <PrimeButton onClick={onBloquear} disabled={!podeBloquear}>
              <LockKeyhole className="h-4 w-4" /> {ocupado ? "Bloqueando…" : "Bloquear acesso"}
            </PrimeButton>
          </div>
        </section>
      )}
    </div>
  );
}
