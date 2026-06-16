# Author Network

Template: network
Plugin id: `openpet.plugin.author-network`

This scaffold uses public configuration only. OpenPet does not support plugin-scoped secrets yet; do not add API keys, tokens, passwords, cookies, or private credentials to `config.schema.json`, plugin storage, or network headers.

## Validate

```bash
npm run validate:plugin -- path/to/this-plugin
```

## Package

```bash
cd path/to/this-plugin
zip -qr ../openpet-plugin-author-network.openpet-plugin.zip .
```

## Submission Rehearsal

```bash
npm run create-plugin-submission-bundle -- path/to/this-plugin --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
```
