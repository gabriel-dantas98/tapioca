import { AwsSecretsGateway } from "../aws/gateway.js";
import { resolveAwsContext } from "../aws/context.js";
import { defaultIsIgnored, processIo } from "./io.js";
import { runCli } from "./program.js";

const code = await runCli(process.argv, {
  gatewayFor: async (options) => new AwsSecretsGateway(await resolveAwsContext(options)),
  io: processIo,
  isIgnored: defaultIsIgnored,
  startUi: async () => {
    throw new Error("A UI não foi incluída neste build.");
  },
});

process.exitCode = code;
