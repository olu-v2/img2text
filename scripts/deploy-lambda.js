require("dotenv").config({ override: true });

const {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  LambdaClient,
  GetFunctionUrlConfigCommand,
  UpdateFunctionCodeCommand,
} = require("@aws-sdk/client-lambda");
const fs = require("fs");

// allow region, role and function name to be provided via environment variables
const client = new LambdaClient({
  region: process.env.AWS_REGION || "us-east-1",
});

async function createLambda() {
  const roleArn = process.env.LAMBDA_ROLE_ARN;

  const functionName = "img2text";
  const zipFile = fs.readFileSync("./function.zip");

  try {
    const createCommand = new CreateFunctionCommand({
      FunctionName: functionName,
      Runtime: "nodejs22.x",
      Role: roleArn,
      Handler: "server.handler",
      Code: { ZipFile: zipFile },
      Description: "Image to Text for AB",
      Timeout: 10,
      MemorySize: 128,
    });
    const result = await client.send(createCommand);
    console.log("Lambda created", result.FunctionArn);
  } catch (error) {
    if (error.name === "ResourceConflictException") {
      console.log("⚙️ Function exists — updating code instead...");
      const updateCommand = new UpdateFunctionCodeCommand({
        FunctionName: functionName,
        ZipFile: zipFile,
      });
      await client.send(updateCommand);
      console.log("Lambda code updated.");
    } else {
      throw error;
    }
  }

  let functionUrl;
  try {
    const getUrl = await client.send(
      new GetFunctionUrlConfigCommand({ FunctionName: functionName }),
    );
    functionUrl = getUrl.FunctionUrl;
    console.log("🔗 Function URL already exists:", functionUrl);
  } catch {
    console.log("Creating new Function URL...");
    const urlCommand = new CreateFunctionUrlConfigCommand({
      FunctionName: functionName,
      AuthType: "NONE",
      Cors: {
        AllowOrigins: ["*"],
        AllowMethods: ["GET", "POST"],
      },
    });
    const urlResult = await client.send(urlCommand);
    functionUrl = urlResult.FunctionUrl;
    console.log("New Function URL created:", functionUrl);
  }

  try {
    const permissionCommand = new AddPermissionCommand({
      FunctionName: functionName,
      Action: "lambda:InvokeFunctionUrl",
      Principal: "*",
      FunctionUrlAuthType: "NONE",
      StatementId: "PublicAccess",
    });
    await client.send(permissionCommand);
    console.log("Public invoke permission confirmed.");
  } catch (err) {
    if (err.name === "ResourceConflictException") {
      console.log("Permission already exists.");
    } else {
      throw err;
    }
  }

  console.log("\n Function ready at:", functionUrl);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `function_url=${functionUrl}\n`,
    );
  }
}

createLambda().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
