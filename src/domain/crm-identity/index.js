const caseParty = require("./case-party")
const roleRegistry = require("./case-party-role-registry")
const contextResolver = require("./case-party-context-resolver")
const decisionTrace = require("./case-party-decision-trace")
const multiResolver = require("./case-party-multi-resolver")
const resolutionStability = require("./case-party-resolution-stability")
const contactMapper = require("./contact-case-party-mapper")

module.exports = {
  ...caseParty,
  ...roleRegistry,
  ...contextResolver,
  ...decisionTrace,
  ...multiResolver,
  ...resolutionStability,
  ...contactMapper
}
