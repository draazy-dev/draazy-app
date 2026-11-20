export default function isTopDialog(panel) {
  const open = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .filter((el) => !el.closest('[inert]'));
  return !open.length || open[open.length - 1] === panel;
}
