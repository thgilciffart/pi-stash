# Publish pi-stash

The npm package is `@thgilciffart/pi-stash`. Use an account with access to that scope.

1. Install dependencies with `npm ci`.
2. Update the version with `npm version patch` or the required release type.
3. Run `npm run check`.
4. Inspect the file list with `npm pack --dry-run`.
5. Sign in with `npm login` and publish with `npm publish --access public`.
6. Push the release commit and version tag.

The `prepublishOnly` hook repeats the checks. The package includes source, documentation, and the license. Pi loads the TypeScript directly. Keep `pi.extensions` and the `pi-package` keyword in the manifest.
