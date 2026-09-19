import ReleaseDetailsDrawer from "./ReleaseDetailsDrawer.jsx";
import ReversalModal from "./ReversalModal.jsx";

// Camada de overlays (detalhes da release / avaliar reversão) compartilhada
// pelas abas "Versões & Releases" e "Histórico". O estado (`overlay`) vive na
// aba: { kind: "details" | "reversal", releaseId }. Só monta enquanto aberto.
export default function ReleaseOverlays({ overlay, versions, onFechar }) {
  if (!overlay) return null;
  if (overlay.kind === "details") {
    const release = versions.releases.byId.get(overlay.releaseId);
    if (!release) return null;
    return <ReleaseDetailsDrawer release={release} exampleLabel={versions.releases.exampleLabel} onFechar={onFechar} />;
  }
  if (overlay.kind === "reversal") {
    return <ReversalModal versions={versions} sourceReleaseId={overlay.releaseId} onFechar={onFechar} />;
  }
  return null;
}
