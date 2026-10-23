(() => {
  const measurementId = "G-WBLE2MDDWQ";
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };

  function track(name, parameters = {}) {
    window.gtag("event", name, { ...parameters, transport_type: "beacon" });
  }

  function pageView() {
    track("page_view", {
      page_title: document.title,
      page_location: window.location.href,
    });
  }

  window.vardyAnalytics = { track, pageView };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);

  // Club titles are set after the season data arrives.
  if (document.body.dataset.page !== "clubs") pageView();

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, document.baseURI);
    if (url.origin !== window.location.origin) return;
    if (link.dataset.clubSlug) {
      track("select_club", {
        club_slug: link.dataset.clubSlug,
        club_name: link.textContent,
      });
    } else {
      track("navigate", { link_path: url.pathname + url.hash });
    }
  });
})();
