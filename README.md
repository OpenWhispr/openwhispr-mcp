# OpenWhispr MCP Server

Remote MCP server for accessing your OpenWhispr notes, folders, transcriptions, and usage stats from any AI assistant that supports the Model Context Protocol.

Hosted at `https://mcp.openwhispr.com/mcp`

## Setup

### 1. Get an API key

Generate an API key from the OpenWhispr desktop app under **Settings > API Keys**. Your key starts with `owk_live_`.

### Alternative: Agent self-setup

AI assistants can create their own API key without the desktop app:

1. **Request a code**: `POST https://api.openwhispr.com/api/v1/auth/email-code` with `{"email": "your@email.com"}`
2. **Enter the code**: Check your email for a 6-digit verification code
3. **Verify**: `POST https://api.openwhispr.com/api/v1/auth/email-code/verify` with `{"email": "...", "code": "123456"}`
4. **Create a key**: `POST https://api.openwhispr.com/api/v1/keys/create` with `Authorization: Bearer owt_...` and `{"name": "My Agent", "scopes": ["notes:read", "notes:write"]}`

The returned `owk_live_` key works the same as one created in the desktop app.

### 2. Connect your AI assistant

#### Claude Code

```bash
claude mcp add openwhispr --transport http https://mcp.openwhispr.com/mcp \
  --header "Authorization: Bearer owk_live_YOUR_KEY"
```

#### Claude Desktop

Go to **Settings > Integrations > Add MCP Server** and enter:

- **URL:** `https://mcp.openwhispr.com/mcp`
- **Authorization:** `Bearer owk_live_YOUR_KEY`

#### Cursor / VS Code

Add to your MCP config (`~/.cursor/mcp.json` or VS Code MCP settings):

```json
{
  "mcpServers": {
    "openwhispr": {
      "url": "https://mcp.openwhispr.com/mcp",
      "headers": {
        "Authorization": "Bearer owk_live_YOUR_KEY"
      }
    }
  }
}
```

## Available Tools

| Tool                  | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `list_notes`          | List notes with optional folder filtering and cursor pagination |
| `get_note`            | Get a single note by ID                                         |
| `create_note`         | Create a new note                                               |
| `update_note`         | Update a note's title, content, or folder                       |
| `delete_note`         | Delete a note                                                   |
| `search_notes`        | Semantic and full-text search across notes                      |
| `list_folders`        | List all folders                                                |
| `create_folder`       | Create a new folder                                             |
| `list_transcriptions` | List transcription history                                      |
| `get_transcription`   | Get a single transcription by ID                                |
| `get_usage`           | Get usage stats, word counts, and plan details                  |

## Example Prompts

- "Show me my recent notes"
- "Search my notes for meeting with the design team"
- "Create a note titled 'Project Ideas' in my Work folder"
- "How many words have I used this month?"
- "List my transcriptions from today"

## Development

```bash
npm install
npm run build
```

Set `OPENWHISPR_API_URL` to override the API base URL for local development.
