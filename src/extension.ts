import * as vscode from 'vscode';

import { CPPView } from './cppView';

export function activate(context: vscode.ExtensionContext) {

  new CPPView(context);

}

export function deactivate() {}