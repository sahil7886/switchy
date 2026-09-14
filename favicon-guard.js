(() => {
  function safePageUrl(value) {
    if (typeof value !== "string" || !value) return "";

    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || isPotentiallyLocalHost(url.hostname)) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function isPotentiallyLocalHost(value) {
    const host = value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.endsWith(".local") || host.endsWith(".localdomain") || host.endsWith(".home") || host.endsWith(".home.arpa") || host.endsWith(".internal") || host.endsWith(".lan")) return true;

    // A literal IPv6 address or a one-label hostname may point to a local
    // machine. Skip it rather than allowing the active website to request it.
    if (host.includes(":")) return true;
    if (!host.includes(".")) return true;

    const parts = host.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
    const octets = parts.map(Number);
    if (octets.some((part) => part > 255)) return true;

    const [first, second] = octets;
    return first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19));
  }

  globalThis.SwitchyFavicon = { safePageUrl };
})();
