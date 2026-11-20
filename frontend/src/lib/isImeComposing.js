// Safari fires compositionend before the confirming keydown, so isComposing is already false
// there; keyCode 229 still marks it. Check only inside an Enter branch: Android sends 229 for every key.
export const isImeComposing = (e) => Boolean((e.nativeEvent ?? e).isComposing) || e.keyCode === 229;
