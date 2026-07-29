function isPostHumanComplementationEnabled() {
  return String(process.env.POST_HUMAN_COMPLEMENTATION_ENABLED || "").toLowerCase() === "true";
}

module.exports = { isPostHumanComplementationEnabled };