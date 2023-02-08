import {
  checkFilesExist,
  ensureNxProject,
  readFile,
  renameFile,
  runNxCommandAsync,
  uniq,
  updateFile,
} from '@nrwl/nx-plugin/testing';

import {
  runCommandUntil,
  promisifiedTreeKill,
  killPort,
  removeFile,
} from '@qwikifiers/e2e/utils';

describe('qwikNxVite plugin e2e', () => {
  // Setting up individual workspaces per
  // test can cause e2e runs to take a long time.
  // For this reason, we recommend each suite only
  // consumes 1 workspace. The tests should each operate
  // on a unique project in the workspace, such that they
  // are not dependant on one another.
  beforeAll(() => {
    ensureNxProject('qwik-nx', 'dist/packages/qwik-nx');
  });

  afterAll(async () => {
    // `nx reset` kills the daemon, and performs
    // some work which can help clean up e2e leftovers
    await runNxCommandAsync('reset');
  });

  describe('should be able to import components from libraries', () => {
    let project: string;
    let headerLibName: string;
    let iconLibName: string;
    beforeAll(async () => {
      project = uniq('qwik-nx');
      headerLibName = uniq('qwik-nx-header');
      iconLibName = uniq('qwik-nx-icon');
      await runNxCommandAsync(
        `generate qwik-nx:app ${project} --no-interactive`
      );
      await runNxCommandAsync(
        `generate qwik-nx:library ${headerLibName} --unitTestRunner=none --no-interactive`
      );
      await runNxCommandAsync(
        `generate qwik-nx:library ${iconLibName} --unitTestRunner=none --no-interactive`
      );

      // move header component into the library

      // update import in layout.tsx
      const layoutFilePath = `apps/${project}/src/routes/layout.tsx`;
      let layoutFile = readFile(layoutFilePath);
      layoutFile = layoutFile.replace(
        `import Header from '../components/header/header';`,
        `import { Header } from '@proj/${headerLibName}';`
      );
      updateFile(layoutFilePath, layoutFile);

      // move header component files
      const headerFolderOldPath = `apps/${project}/src/components/header`;
      const headerFolderNewPath = `libs/${headerLibName}/src/lib`;
      removeFile(`${headerFolderNewPath}/${headerLibName}.tsx`);
      removeFile(`${headerFolderNewPath}/${headerLibName}.css`);
      renameFile(
        `${headerFolderOldPath}/header.tsx`,
        `${headerFolderNewPath}/header.tsx`
      );
      renameFile(
        `${headerFolderOldPath}/header.css`,
        `${headerFolderNewPath}/header.css`
      );
      updateFile(
        `libs/${headerLibName}/src/index.ts`,
        `export * from './lib/header';`
      );

      // update header.tsx contents
      let headerTsx = readFile(`${headerFolderNewPath}/header.tsx`);
      headerTsx = headerTsx.replace(
        `import { QwikLogo } from '../icons/qwik';`,
        `import { QwikLogo } from '@proj/${iconLibName}';`
      );
      headerTsx = headerTsx.replace(
        'export default component$(() => {',
        'export const Header = component$(() => {'
      );
      updateFile(`${headerFolderNewPath}/header.tsx`, headerTsx);

      // move icon component file
      const qwikIconFolderNewPath = `libs/${iconLibName}/src/lib`;
      removeFile(`${qwikIconFolderNewPath}/${iconLibName}.tsx`);
      removeFile(`${qwikIconFolderNewPath}/${iconLibName}.css`);
      renameFile(
        `apps/${project}/src/components/icons/qwik.tsx`,
        `${qwikIconFolderNewPath}/qwik.tsx`
      );
      updateFile(
        `libs/${iconLibName}/src/index.ts`,
        `export * from './lib/qwik';`
      );
    }, 200000);

    it('should be able to successfully build the application', async () => {
      const result = await runNxCommandAsync(`build-ssr ${project}`);
      expect(result.stdout).toContain(
        `Successfully ran target build-ssr for project ${project}`
      );
      expect(() =>
        checkFilesExist(`dist/apps/${project}/client/q-manifest.json`)
      ).not.toThrow();
      expect(() =>
        checkFilesExist(`dist/apps/${project}/server/entry.preview.mjs`)
      ).not.toThrow();
    }, 200000);

    it('should serve application in preview mode with custom port', async () => {
      const port = 4212;
      const p = await runCommandUntil(
        `run ${project}:preview --port=${port}`,
        (output) => {
          return output.includes('Local:') && output.includes(`:${port}`);
        }
      );
      try {
        await promisifiedTreeKill(p.pid, 'SIGKILL');
        await killPort(port);
      } catch {
        // ignore
      }
    }, 200000);
  });
});