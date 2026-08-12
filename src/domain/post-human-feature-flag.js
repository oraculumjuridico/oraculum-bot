function isPostHumanComplementationEnabled() {
  const configured = String(process.env.POST_HUMAN_COMPLEMENTATION_ENABLED || "").toLowerCase();
  if (configured) return configured === "true";
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

module.exports = { isPostHumanComplementationEnabled };
