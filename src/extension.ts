import * as vscode from 'vscode';

import { NodeDependenciesProvider } from './nodeDependencies';

export function activate(context: vscode.ExtensionContext) {

  vscode.window.registerTreeDataProvider(
    'nodeDependencies',
    new NodeDependenciesProvider(vscode.workspace.rootPath!)
  );

}

export function deactivate() {}