import inquirer from "inquirer";
import axios from "axios";
import { Command } from "commander";
import { parse, stringify } from "envfile";
import * as fs from "fs";
import chalk from 'chalk';
import Table from 'cli-table3';

const program = new Command("setup");

program
  .description("Create .env.production or .env.development.local file for React project")
  .action(async (options) => {
    let envExist = {};
    const envTypes = {
      PROD: "./.env.production",
      DEV_LOCAL: "./.env.development.local",
    };

    await checkExistConfigurations(envTypes.PROD);
    await checkExistConfigurations(envTypes.DEV_LOCAL);

    console.log("\n");
    console.log("Welcome to Cyoda UI setup utility. This utility will help you correctly setup the React UI and check functionality");
    console.log("-------");

    const inquirerResult = await inquirer.prompt([
      {
        type: "message",
        message: "If you use relative paths and not full URLs with http(s), the utility cannot check correct settings",
        name: "confirm"
      },
      {
        type: "list",
        message: "Select environment",
        choices: [
          {
            name: "For production",
            value: "PROD",
          },
          {
            name: "For development",
            value: "DEV_LOCAL",
          },
        ],
        name: "envType",
        filter: (input) => {
          if (!fs.existsSync(envTypes[input])) return input;
          const envExistContent = fs.readFileSync(envTypes[input], 'utf-8');
          envExist = parse(envExistContent);
          return input;
        }
      },
      {
        type: "input",
        message: "API url. Example: https://domain.com/api. Default:",
        default: () => envExist.VITE_APP_API_BASE || "/api",
        name: "VITE_APP_API_BASE",
        validate: async (input) => {
          if (!input.includes("http")) return true;
          const { status } = await axios.get(input, { validateStatus: () => true });
          if (status === 401) return true;
          return "API url is not correct";
        }
      },
      {
        type: "input",
        message: "Processing url. Example: https://domain.com/processing. Default: ",
        default: () => envExist.VITE_APP_API_BASE_PROCESSING || "/processing",
        name: "VITE_APP_API_BASE_PROCESSING",
        validate: async (input) => {
          if (!input.includes("http")) return true;
          const { status } = await axios.get(input, { validateStatus: () => true });
          if (status === 401) return true;
          return "Processing url is not correct";
        }
      },
      {
        type: "input",
        message: "Deploy folder. If in root folder '/', if in sub folder '/folder-a' Default: ",
        default: () => envExist.VITE_PUBLIC_PATH || "/",
        name: "VITE_PUBLIC_PATH",
        when: function (answers) {
          return answers.envType === 'PROD';
        },
      },
      {
        type: "input",
        message: "If not empty will be used as VITE_PUBLIC_PATH",
        default: () => envExist.VITE_APP_PUBLIC_PATH || null,
        name: "VITE_APP_PUBLIC_PATH",
        when: function (answers) {
          return answers.envType === 'PROD';
        },
      },
      {
        type: "confirm",
        message: "Do you want to set Feature Flags?",
        name: "confirmFeatureFlags"
      },
      {
        type: "confirm",
        message: "FF: Use ChatBot?",
        name: "VITE_FEATURE_FLAG_CHATBOT",
        default: () => envExist.VITE_FEATURE_FLAG_CHATBOT || false,
        when: function (answers) {
          return answers.confirmFeatureFlags;
        },
      },
      {
        type: "confirm",
        message: "FF: Use Models Info?",
        name: "VITE_FEATURE_FLAG_USE_MODELS_INFO",
        default: () => envExist.VITE_FEATURE_FLAG_USE_MODELS_INFO || false,
        when: function (answers) {
          return answers.confirmFeatureFlags;
        },
      },
      {
        type: "confirm",
        message: "FF: Use Cyoda Cloud?",
        name: "VITE_FEATURE_FLAG_IS_CYODA_CLOUD",
        default: () => envExist.VITE_FEATURE_FLAG_IS_CYODA_CLOUD || false,
        when: function (answers) {
          return answers.confirmFeatureFlags;
        },
      },
      {
        type: "confirm",
        message: "Do you want to set OIDC login settings?",
        name: "confirmOidc"
      },
      {
        type: "input",
        message: "OIDC: Button display name (e.g. Auth0, Zitadel)",
        name: "VITE_APP_OIDC_DISPLAY_NAME",
        default: () => envExist.VITE_APP_OIDC_DISPLAY_NAME || 'SSO',
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Issuer URL (exactly as in the provider's discovery document)",
        name: "VITE_APP_OIDC_ISSUER",
        default: () => envExist.VITE_APP_OIDC_ISSUER || null,
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Client ID (public client, PKCE)",
        name: "VITE_APP_OIDC_CLIENT_ID",
        default: () => envExist.VITE_APP_OIDC_CLIENT_ID || null,
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Scopes",
        name: "VITE_APP_OIDC_SCOPES",
        default: () => envExist.VITE_APP_OIDC_SCOPES || 'openid profile email offline_access',
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Extra authorize params (query string, e.g. audience=...&organization=...)",
        name: "VITE_APP_OIDC_EXTRA_PARAMS",
        default: () => envExist.VITE_APP_OIDC_EXTRA_PARAMS || '',
        when: (answers) => answers.confirmOidc,
      },
      {
        type: "input",
        message: "OIDC: Logout URL (only if the provider has no end_session_endpoint)",
        name: "VITE_APP_OIDC_LOGOUT_URL",
        default: () => envExist.VITE_APP_OIDC_LOGOUT_URL || '',
        when: (answers) => answers.confirmOidc,
      },
    ]);

    const env = {
      VITE_APP_API_BASE: inquirerResult.VITE_APP_API_BASE || '',
      VITE_APP_API_BASE_PROCESSING: inquirerResult.VITE_APP_API_BASE_PROCESSING || '',
      VITE_PUBLIC_PATH: inquirerResult.VITE_PUBLIC_PATH || '',
      VITE_APP_PUBLIC_PATH: inquirerResult.VITE_APP_PUBLIC_PATH || '',
    };

    if (inquirerResult.confirmFeatureFlags) {
      env.VITE_FEATURE_FLAG_CHATBOT = inquirerResult.VITE_FEATURE_FLAG_CHATBOT;
      env.VITE_FEATURE_FLAG_USE_MODELS_INFO = inquirerResult.VITE_FEATURE_FLAG_USE_MODELS_INFO;
    } else {
      env.VITE_FEATURE_FLAG_CHATBOT = false;
      env.VITE_FEATURE_FLAG_USE_MODELS_INFO = false;
    }

    if (inquirerResult.confirmOidc) {
      for (const key of [
        'VITE_APP_OIDC_DISPLAY_NAME',
        'VITE_APP_OIDC_ISSUER',
        'VITE_APP_OIDC_CLIENT_ID',
        'VITE_APP_OIDC_SCOPES',
        'VITE_APP_OIDC_EXTRA_PARAMS',
        'VITE_APP_OIDC_LOGOUT_URL',
      ]) {
        if (inquirerResult[key]) env[key] = inquirerResult[key];
      }
    }

    const envContent = stringify(env);
    fs.writeFileSync(envTypes[inquirerResult.envType], envContent);

    console.log('\n-----------');
    console.log(`File "${envTypes[inquirerResult.envType].replace('./', '')}" was created. Now run:\n`);

    if (inquirerResult.envType === 'DEV_LOCAL') {
      console.log(`  ${chalk.green.bold(`npm run dev`)}\n`);
    } else if (inquirerResult.envType === 'PROD') {
      console.log(`  ${chalk.green.bold(`npm run build`)}\n`);
    }
  });

/**
 * Display environment variables in a table
 */
function displayEnvInTable(data) {
  const table = new Table({
    style: { head: ['green'] },
    head: ['Keys', 'Values'],
  });

  Object.keys(data).forEach((key) => {
    table.push([key, data[key]]);
  });

  console.log(table.toString());
}

/**
 * Check if configuration file already exists and display it
 */
async function checkExistConfigurations(path) {
  if (fs.existsSync(path)) {
    const envExistContent = fs.readFileSync(path, 'utf-8');
    const envExist = parse(envExistContent);

    displayEnvInTable(envExist);

    await inquirer.prompt([
      {
        type: "message",
        message: `You already have ${path} variables. Do you want to continue?`,
        name: "confirm"
      },
    ]);
  }
}

export default program;

