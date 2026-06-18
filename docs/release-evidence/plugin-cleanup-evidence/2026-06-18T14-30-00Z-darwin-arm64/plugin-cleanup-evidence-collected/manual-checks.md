# OpenPet Plugin Cleanup Evidence Manual Checklist

This checklist is generated from the same required check matrix used by the cleanup evidence validator. Attach concrete evidence before marking any check as pass.

| Check ID | What To Prove | Evidence Guidance |
|----------|---------------|-------------------|
| `service-exit-confirmed-stop` | Service stop remains visible until child exit confirmation | Attach service logs or terminal output showing the service stayed in stopping state until child exit confirmation. |
| `service-process-group-cleanup` | Service stop attempts process-group cleanup | Attach logs or process listings showing service stop attempted process-group cleanup. |
| `service-tree-fallback-cleanup` | Service stop falls back to host-owned process-tree cleanup when process-group signalling fails | Attach process-tree evidence showing host-owned descendant cleanup was attempted when process-group cleanup failed. |
| `service-force-stop` | Stubborn service receives one bounded host-side force-stop attempt | Attach stubborn-service evidence showing exactly one bounded host-side force-stop attempt. |
| `setup-exit-confirmed-stop` | Setup stop remains visible until child exit confirmation | Attach setup runtime logs showing stop completion only after child exit confirmation. |
| `setup-tree-fallback-cleanup` | Setup cleanup tries host-owned process-tree cleanup before direct child kill | Attach setup cleanup logs or process listings showing tree fallback before direct child kill. |
| `command-exit-confirmed-stop` | Declaration command stop remains visible until child exit confirmation | Attach declaration-command logs showing stop completion only after child exit confirmation. |
| `command-tree-fallback-cleanup` | Declaration command cleanup tries host-owned process-tree cleanup before direct child kill | Attach declaration-command cleanup logs or process listings showing tree fallback before direct child kill. |
