# @cyoda/cli

Command-line interface utility for setting up Cyoda UI React projects.

## Overview

This CLI tool helps you create and configure environment files (`.env.production` and `.env.development.local`) for the Cyoda UI React project. It provides an interactive setup wizard that validates your configuration and ensures everything is set up correctly.

## Features

- ✅ Interactive setup wizard
- ✅ Environment file generation (.env.production, .env.development.local)
- ✅ API endpoint validation
- ✅ Feature flags configuration
- ✅ OIDC login setup (Auth0, Zitadel, any OIDC provider)
- ✅ Existing configuration detection and display
- ✅ Beautiful CLI interface with colors and tables

## Installation

### Local Installation (Recommended)

```bash
cd react-project/packages/cli
npm install
```

### Global Installation

```bash
npm install -g @cyoda/cli
```

Or link locally for development:

```bash
cd react-project/packages/cli
npm link
```

## Usage

### Run Setup Command

```bash
# If installed globally or linked
cyoda-cli setup

# If installed locally
node index.mjs setup
```

### Interactive Setup

The CLI will guide you through:

1. **Environment Selection**: Choose between production or development
2. **API Configuration**: 
   - API base URL (e.g., `https://domain.com/api`)
   - Processing API URL (e.g., `https://domain.com/processing`)
3. **Deployment Settings** (production only):
   - Public path for deployment
4. **Feature Flags** (optional):
   - ChatBot feature
   - Models Info feature
5. **OIDC Login Configuration** (optional):
   - Button display name (e.g. Auth0, Zitadel)
   - Issuer URL (exactly as in the provider's discovery document)
   - Client ID (public client, PKCE)
   - Scopes
   - Extra authorize params (query string, e.g. audience=...&organization=...)
   - Logout URL (only if the provider has no end_session_endpoint)

### Example Output

```
  ____                _         _   _ ___    ____ _     ___
 / ___|   _  ___   __| | __ _  | | | |_ _|  / ___| |   |_ _|
| |  | | | |/ _ \ / _` |/ _` | | | | || |  | |   | |    | |
| |__| |_| | (_) | (_| | (_| | | |_| || |  | |___| |___ | |
 \____\__, |\___/ \__,_|\__,_|  \___/|___|  \____|_____|___|
      |___/

Welcome to Cyoda UI setup utility...
```

## Environment Variables

The CLI configures the following environment variables:

### Required Variables

- `VITE_APP_API_BASE` - Base URL for the API
- `VITE_APP_API_BASE_PROCESSING` - Base URL for processing API

### Optional Variables

- `VITE_PUBLIC_PATH` - Public path for deployment (production only)
- `VITE_APP_PUBLIC_PATH` - Alternative public path (production only)
- `VITE_FEATURE_FLAG_CHATBOT` - Enable/disable ChatBot feature
- `VITE_FEATURE_FLAG_USE_MODELS_INFO` - Enable/disable Models Info feature
- `VITE_APP_OIDC_DISPLAY_NAME` - Button display name (e.g. Auth0, Zitadel)
- `VITE_APP_OIDC_ISSUER` - OIDC issuer URL
- `VITE_APP_OIDC_CLIENT_ID` - OIDC client ID (public client, PKCE)
- `VITE_APP_OIDC_SCOPES` - OIDC scopes
- `VITE_APP_OIDC_EXTRA_PARAMS` - Extra authorize params (query string)
- `VITE_APP_OIDC_LOGOUT_URL` - Logout URL (only if the provider has no end_session_endpoint)

## File Structure

```
@cyoda/cli/
├── commands/
│   └── setup.mjs          # Setup command implementation
├── hooks/
│   └── hookInit.mjs       # CLI banner display
├── index.mjs              # Main entry point
├── package.json           # Package configuration
└── README.md              # This file
```

## Development

### Adding New Commands

1. Create a new command file in `commands/`:

```javascript
// commands/mycommand.mjs
import { Command } from "commander";

const program = new Command("mycommand");

program
  .description("My custom command")
  .action(async (options) => {
    // Command implementation
  });

export default program;
```

2. Import and add to `index.mjs`:

```javascript
import mycommand from "./commands/mycommand.mjs";
program.addCommand(mycommand);
```

## Dependencies

- **commander** - CLI framework
- **inquirer** - Interactive prompts
- **chalk** - Terminal colors
- **figlet** - ASCII art text
- **cli-table3** - Terminal tables
- **axios** - HTTP client for validation
- **envfile** - Environment file parsing
- **tslog** - Logging

## Migration Notes

This package is **framework-agnostic** and works with both Vue and React projects. The only changes from the Vue version are:

- Updated package description
- Changed `yarn` commands to `npm` commands in output
- Added shebang for executable
- Improved error handling
- Added JSDoc comments

## License

MIT

## Version

1.0.0 - React Migration

