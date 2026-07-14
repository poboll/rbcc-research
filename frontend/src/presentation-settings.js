export const PRESENTATION_KEY = "rbcc-presentation-settings-v1";
export const DEFAULT_PRESENTATION = { memberX:8, companyX:118, companyWidth:172, columnGap:28, rowHeight:58, expandOffset:52, coreGap:12, assetGap:48, fitPadding:10, fontScale:100 };

export function loadPresentationSettings() {
  try { return { ...DEFAULT_PRESENTATION, ...JSON.parse(localStorage.getItem(PRESENTATION_KEY) || "{}") }; }
  catch { return { ...DEFAULT_PRESENTATION }; }
}

export function savePresentationSettings(settings) {
  localStorage.setItem(PRESENTATION_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("rbcc:presentation-settings", { detail: settings }));
}
