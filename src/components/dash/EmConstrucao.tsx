// Estado honesto "em construção" das páginas novas (Fase 0).
//
// Sem dado inventado, sem lorem, sem métrica de enfeite: diz em português claro
// o que a página VAI ser e o que ainda não existe. É o mesmo compromisso do
// resto do app — número que aparece na tela vem de uma fonte que existe.
export default function EmConstrucao({
  oQueE,
  vaiTer,
  nota,
}: {
  oQueE: string;
  vaiTer: string[];
  nota?: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-dash-hair/[0.12] bg-dash-card/60 px-6 py-8">
      <span className="inline-flex rounded-full bg-dash-raise px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-dash-muted">
        em construção
      </span>

      <p className="mt-4 max-w-[560px] text-[15px] leading-[1.6] text-dash-fg/85">{oQueE}</p>

      <ul className="mt-6 space-y-2.5">
        {vaiTer.map((t) => (
          <li key={t} className="flex items-start gap-3 text-[13px] leading-[1.5] text-dash-muted">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-dash-brand" />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      {nota && <p className="mt-6 text-[12px] leading-[1.5] text-dash-dim">{nota}</p>}
    </div>
  );
}
