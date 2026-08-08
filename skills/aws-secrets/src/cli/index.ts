import { AwsSecretsGateway } from "../aws/gateway.js";
import { resolveAwsContext } from "../aws/context.js";
import { defaultIsIgnored, processIo } from "./io.js";
import { runCli } from "./program.js";
import { startUiServer } from "../server/start.js";

const code = await runCli(process.argv, {
  gatewayFor: async (options) => new AwsSecretsGateway(await resolveAwsContext(options)),
  io: processIo,
  isIgnored: defaultIsIgnored,
  startUi: async ({ gateway }) => startUiServer({ gateway }),
});

process.exitCode = code;
