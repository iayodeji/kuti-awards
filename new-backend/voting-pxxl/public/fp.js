// Browser fingerprint for device mode. Include in the UI and send the result as `fp` with every
// /api/session and /api/vote call. Deliberately coarse: stable signals only, so one person is not
// split into several devices. It is NOT secret and a script can fake it; see README.
async function getFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages || []).join(","),
    navigator.hardwareConcurrency || "",
    navigator.deviceMemory || "",
    navigator.maxTouchPoints || 0,
    screen.width + "x" + screen.height + "x" + screen.colorDepth,
    window.devicePixelRatio || 1,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasSig(),
    webglSig(),
  ];
  const data = new TextEncoder().encode(parts.join("||"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

window.getFingerprint = getFingerprint;

function canvasSig() {
  try {
    const c = document.createElement("canvas");
    c.width = 200; c.height = 40;
    const g = c.getContext("2d");
    g.textBaseline = "top"; g.font = "16px Arial";
    g.fillStyle = "#f60"; g.fillRect(10, 5, 80, 20);
    g.fillStyle = "#069"; g.fillText("Akọni 72 ✨", 4, 8);
    return c.toDataURL().slice(-80);
  } catch { return "nocanvas"; }
}

function webglSig() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) + "/" + gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "nowebgl";
  } catch { return "nowebgl"; }
}
