// Alterna entre modo claro y oscuro sin recargar y recuerda la elección.
(() => {
  const buttons = document.querySelectorAll(".theme-toggle");
  const themeColor = document.querySelector('meta[name="theme-color"]');

  function apply(theme) {
    const dark = theme === "dark";
    const label = dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeColor.content = dark ? "#0a2f6b" : "#0d56c9";
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", label);
      button.title = label;
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      apply(next);
      Store.setTheme(next);
    });
  });

  apply(document.documentElement.dataset.theme);
})();
