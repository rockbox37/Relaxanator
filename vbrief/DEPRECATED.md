<!-- deft:vbrief-deprecated -->
# Deprecated: legacy `vbrief/` root

This project has migrated to the `xbrief/` lifecycle layout. This `vbrief/`
directory is retained only for read-compatibility and is **not** an active
source of truth. Do not add new scope work here — use `xbrief/` instead.

Once you no longer need read-compatibility with the legacy layout, delete this
`vbrief/` directory. Re-running `deft migrate:xbrief` re-checks convergence.
