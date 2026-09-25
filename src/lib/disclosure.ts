/**
 * Meniuri derulante simple (butonul „Despre noi” și selectorul de limbă).
 * Structura: un element `[data-disclosure]` care conține butonul
 * `[data-disclosure-button]` cu `aria-controls` spre panou.
 *
 * Clic pe buton deschide/închide; Escape închide și întoarce focusul pe buton;
 * un clic în afară sau focusul care pleacă în altă parte închid panoul.
 */
export function initDisclosures() {
  document.querySelectorAll<HTMLElement>('[data-disclosure]').forEach((root) => {
    const button = root.querySelector<HTMLButtonElement>('[data-disclosure-button]');
    const panelId = button?.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!button || !panel) return;

    const isOpen = () => button.getAttribute('aria-expanded') === 'true';
    const set = (open: boolean) => {
      button.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      button.querySelector('[data-chevron]')?.classList.toggle('rotate-180', open);
    };

    button.addEventListener('click', () => set(!isOpen()));
    root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !isOpen()) return;
      ev.stopPropagation();
      set(false);
      button.focus();
    });
    document.addEventListener('click', (ev) => {
      if (isOpen() && !root.contains(ev.target as Node)) set(false);
    });
    root.addEventListener('focusout', (ev) => {
      const next = ev.relatedTarget;
      if (isOpen() && next instanceof Node && !root.contains(next)) set(false);
    });
  });
}
