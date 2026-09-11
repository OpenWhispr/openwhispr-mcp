# OpenWhispr MCP Server

Remote MCP server for accessing your OpenWhispr notes, folders, transcriptions, dictionary, snippets, and usage stats from any AI assistant that supports the Model Context Protocol.

Hosted at `https://mcp.openwhispr.com/mcp`

## Setup

### 1. Get an API key

Generate an API key from the OpenWhispr desktop app under **Settings > API Keys**. Your key starts with `owk_live_`.

### Alternative: Agent self-setup

AI assistants can create their own API key without the desktop app:

1. **Request a code**: `POST https://api.openwhispr.com/api/v1/auth/email-code` with `{"email": "your@email.com"}`
2. **Enter the code**: Check your email for a 6-digit verification code
3. **Verify**: `POST https://api.openwhispr.com/api/v1/auth/email-code/verify` with `{"email": "...", "code": "123456"}`
4. **Create a key**: `POST https://api.openwhispr.com/api/v1/keys/create` with `Authorization: Bearer owt_...` and `{"name": "My Agent", "scopes": ["notes:read", "notes:write", "dictionary:write", "snippets:write"]}`

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

| Tool                     | Description                                                          |
| ------------------------ | -------------------------------------------------------------------- |
| `list_notes`             | List notes with optional folder filtering and cursor pagination      |
| `get_note`               | Get a single note by ID                                              |
| `create_note`            | Create a new note                                                    |
| `update_note`            | Update a note's title, content, or folder                            |
| `delete_note`            | Delete a note                                                        |
| `search_notes`           | Semantic and full-text search across notes                           |
| `list_folders`           | List all folders                                                     |
| `create_folder`          | Create a new folder                                                  |
| `list_transcriptions`    | List transcription history                                           |
| `get_transcription`      | Get a single transcription by ID                                     |
| `get_note_transcript`    | Get the transcript for a specific note with structured segments      |
| `list_dictionary`        | List custom dictionary words that transcription should spell exactly |
| `add_dictionary_words`   | Add words, names, or jargon to the dictionary                        |
| `update_dictionary_word` | Change the spelling of a dictionary entry                            |
| `delete_dictionary_word` | Remove a word from the dictionary                                    |
| `list_snippets`          | List snippets: spoken triggers that expand into saved text           |
| `create_snippet`         | Create a snippet                                                     |
| `update_snippet`         | Update a snippet's trigger or replacement                            |
| `delete_snippet`         | Delete a snippet                                                     |
| `transcribe_audio`       | Transcribe a short audio clip with OpenWhispr Cloud (beta)           |
| `get_usage`              | Get usage stats, word counts, and plan details                       |

**Beta:** `transcribe_audio` accepts clips up to 3 MB (wav, mp3, m4a, ogg, flac, or webm), requires a Pro or Business plan, and is limited to 600 minutes per month. Limits and response shape may change during the beta. For longer files use the [OpenWhispr CLI](https://www.npmjs.com/package/@openwhispr/cli), which can also transcribe locally for free.

## Required Scopes

Create the API key with only the scopes you need:

| Scope                  | Tools                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| `notes:read`           | `list_notes`, `get_note`, `search_notes`, `list_folders`, `get_note_transcript` |
| `notes:write`          | `create_note`, `update_note`, `delete_note`, `create_folder`                    |
| `transcriptions:read`  | `list_transcriptions`, `get_transcription`                                      |
| `transcriptions:write` | `transcribe_audio`                                                              |
| `dictionary:read`      | `list_dictionary`                                                               |
| `dictionary:write`     | `add_dictionary_words`, `update_dictionary_word`, `delete_dictionary_word`      |
| `snippets:read`        | `list_snippets`                                                                 |
| `snippets:write`       | `create_snippet`, `update_snippet`, `delete_snippet`                            |
| `usage:read`           | `get_usage`                                                                     |

## Example Prompts

- "Show me my recent notes"
- "Search my notes for meeting with the design team"
- "Create a note titled 'Project Ideas' in my Work folder"
- "How many words have I used this month?"
- "List my transcriptions from today"
- "Add 'Orukeet' and 'Parakeet' to my dictionary"
- "Remove duplicate or misspelled words from my dictionary"
- "Create a snippet so saying 'my address' inserts my mailing address"
- "Transcribe this voice memo"

## Development

```bash
npm install
npm run build
```

Set `OPENWHISPR_API_URL` to override the API base URL for local development.
