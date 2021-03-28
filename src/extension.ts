import * as vscode from 'vscode';

import { FileExplorer } from './cppViewTree';

export function activate(context: vscode.ExtensionContext) {

  new FileExplorer(context);

}

export function deactivate() {}