# Publish to npm

The package name is `@thgilciffart/pi-stash`. Publication requires an npm account with access to that scope.

For interactive publication, enable two-factor authentication on your npm account. See [npm's publishing authentication requirements](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/).

1. Install the development dependencies.

   ```sh
   npm ci
   ```

2. Run the type check and tests.

   ```sh
   npm run check
   ```

3. Inspect the package contents.

   ```sh
   npm pack --dry-run
   ```

   The package contains `src/`, `docs/`, `README.md`, `LICENSE`, and `package.json`. The file allowlist excludes tests, local prompts, and development dependencies.

4. Sign in with an account that can publish to the scope.

   ```sh
   npm login
   npm whoami
   ```

5. For a later release, update the version before publishing. The first release uses `0.1.0`.

6. Publish the package.

   ```sh
   npm publish --access public
   ```

   The `prepublishOnly` hook runs the checks again. Complete any npm authentication challenge shown during publication.

7. Verify the release, then install it in Pi.

   ```sh
   npm view @thgilciffart/pi-stash version
   pi install npm:@thgilciffart/pi-stash
   ```

   Restart Pi or run `/reload`, then run `/stash`.

The manifest includes the `pi-package` keyword, which makes an npm package eligible for the [Pi package gallery](https://pi.dev/docs/latest/packages). Gallery indexing happens after publication. The manifest also declares `src/index.ts` as its extension entry point. Pi loads the TypeScript source directly, so the package needs no build step.

Pi supplies `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`. They remain peer dependencies. `yaml` is the extension's runtime dependency. The development-only override selects a patched `undici` for the Pi test installation.
