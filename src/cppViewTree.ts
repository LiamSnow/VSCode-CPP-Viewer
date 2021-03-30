import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';
import { ViewColumn } from 'vscode';
import { ThemeIcon } from 'vscode';

export class FileSystemProvider implements vscode.TreeDataProvider<Entry>, vscode.FileSystemProvider {

	//File System Provider
	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;

	constructor() {
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	}

	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
			const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

			// TODO support excludes (using minimatch library?)

			this._onDidChangeFile.fire([{
				type: event === 'change' ? vscode.FileChangeType.Changed : await _.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
				uri: uri.with({ path: filepath })
			} as vscode.FileChangeEvent]);
		});

		return { dispose: () => watcher.close() };
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.fsPath);
	}

	async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await _.stat(path));
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await _.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		return _.mkdir(uri.fsPath);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return _.readfile(uri.fsPath);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

	async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(uri.fsPath);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await _.mkdir(path.dirname(uri.fsPath));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return _.writefile(uri.fsPath, content as Buffer);
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return _.rmrf(uri.fsPath);
		}

		return _.unlink(uri.fsPath);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

	async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(newUri.fsPath);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await _.rmrf(newUri.fsPath);
			}
		}

		const parentExists = await _.exists(path.dirname(newUri.fsPath));
		if (!parentExists) {
			await _.mkdir(path.dirname(newUri.fsPath));
		}

		return _.rename(oldUri.fsPath, newUri.fsPath);
	}

	// tree data provider
	async getEntriesFromDir(baseUri: vscode.Uri): Promise<Entry[]> {
		const children = await this.readDirectory(baseUri);
		return children
			.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(baseUri.fsPath, name)), type }))
			.sort((a, b) => { 
				if (a.type === b.type) {
					const nameA = a.uri.fsPath.toLowerCase();
					const nameB = b.uri.fsPath.toLowerCase();
					if (nameA < nameB) {
						return -1;
					} else if (nameA > nameB) {
						return 1;
					} else return 0;
				}
				else return (a.type < b.type) ? 1 : -1;
			});
	}
	async getEntryFromDir(dir: string, baseUri: vscode.Uri | undefined): Promise<Entry | undefined> {
		if (!baseUri)
			return undefined;

		const children = await _.readdir(baseUri.fsPath);
		for (let i = 0; i < children.length; i++) {
			const name = children[i];
			if (name === dir) {
				return {
					uri: vscode.Uri.file(path.join(baseUri.fsPath, name)),
					type: (await this._stat(path.join(baseUri.fsPath, name))).type
				};
			}
		}
		return undefined;
	}
	async getChildren(element?: Entry): Promise<Entry[]> {
		//child dir
		if (element) {
			if (element.type === vscode.FileType.File) {
				//CPPGroup
				let returnList = [ { uri: element.uri, type: vscode.FileType.File, title: 'include' } ];

				//search for include/ base directory
				const fsPath = element.uri.fsPath;
				const includeInd = fsPath.indexOf('include');
				if (includeInd != -1) {
					//add similar files in cpp/ (if exist)
					const cppDir = path.join(
						fsPath.substring(0, includeInd), //before include/ folder
						'\\cpp\\', //add cpp/ folder
						//remove .h from fsPath, then get from after include/ folder
						fsPath.slice(0, -path.extname(fsPath).length).substring(includeInd + 'include'.length) 
						) + '.cpp';
					if ((await _.stat(cppDir)).isFile()) {
						returnList.push({
							uri: vscode.Uri.file(cppDir), 
							type: vscode.FileType.File,
							title: 'cpp'
						});
					}
				}

				//return all
				return returnList;
			}

			else if (element.type === vscode.FileType.Directory) {
				//Folder
				const entries = await this.getEntriesFromDir(element.uri);
				const entriesSize = entries.length;
				if (entries && entriesSize > 0) {
					//search for cpp/inc.
					const dirs = ['cpp', 'include'];
					let children: Entry[] = [];
					let matched = false;
					for (let i = 0; i < entriesSize; i++) {
						const basename = path.basename(entries[i].uri.fsPath);
						if (entries[i] && dirs.indexOf(basename) !== -1) {
							//combine lists
							if (!matched || basename === 'include') {
								matched = true;
								children = await this.getChildren(entries[i]);
							}
						}
					}

					//return the children if has cpp/inc
					if (matched) {
						return children;
					}

					//else return sub elements
					else {
						return entries;
					}
				}
			}
		}

		//base dir
		else {
			const workspaceFolder = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file')[0];
			if (workspaceFolder) {
				return (await this.getEntriesFromDir(workspaceFolder.uri));
				// const src = await this.getEntryFromDir('src', workspaceFolder.uri);
				// if (src) {
				// 	return await this.getEntriesFromDir(src.uri);
				// }
			}
		}

		//fallback
		return [];
	}
	async getTreeItem(element: Entry): Promise<vscode.TreeItem> {
		if (element.type === vscode.FileType.File) {
			//cpp group
			const cppGroupExts = [ '.cpp', '.h', '.hpp' ];
			if (cppGroupExts.includes(path.extname(element.uri.fsPath)) && !element.title) {
				const name = path.parse(element.uri.fsPath).name;
				const treeItem = new vscode.TreeItem(
					name, 
					vscode.TreeItemCollapsibleState.Collapsed
				);
				const children = await this.getChildren(element);
				const cppSource = children.find(x => x.title === 'cpp');
				const includeSource = children.find(x => x.title === 'include');
				if (cppSource) {
					treeItem.command = { command: 'cppView.openFilesSplit', title: "Open File", arguments: [includeSource!.uri, cppSource.uri], };
				} else {
					treeItem.command = { command: 'cppView.openFile', title: "Open File", arguments: [includeSource!.uri], };
				}
				treeItem.contextValue = 'cppView.Group';
				treeItem.iconPath = ThemeIcon.File;
				return treeItem;
			}

			//normal file
			else {
				const treeItem = new vscode.TreeItem(
					element.uri
				);
				treeItem.command = { command: 'cppView.openFile', title: "Open File", arguments: [element.uri], };
				treeItem.contextValue = 'cppView.Sub';
				return treeItem;
			}
		}

		else if (element.type === vscode.FileType.Directory) {
			//dir
			return new vscode.TreeItem(element.uri, vscode.TreeItemCollapsibleState.Collapsed);	
		}

		//fallback
		return new vscode.TreeItem("error");
	}
}

export class FileExplorer {
	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		context.subscriptions.push(vscode.window.createTreeView('cppView', { treeDataProvider }));
		vscode.commands.registerCommand('cppView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('cppView.openFilesSplit', (resource1, resource2) => this.openFilesSplit(resource1, resource2));
	}

	private openFile(resource: vscode.Uri): void {
		vscode.window.showTextDocument(resource, { preserveFocus: false, preview: true, viewColumn: ViewColumn.One });
	}

	private openFilesSplit(resource1: vscode.Uri, resource2: vscode.Uri): void {
		//vscode.commands.executeCommand('workbench.action.closeAllEditors');
		vscode.window.showTextDocument(resource1, { preserveFocus: false, preview: true, viewColumn: ViewColumn.One });
		vscode.window.showTextDocument(resource2, { preserveFocus: false, preview: true, viewColumn: ViewColumn.Two });
	}
}

interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
	title?: string;
}

namespace _ {

	function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
		if (error) {
			reject(massageError(error));
		} else {
			resolve(result);
		}
	}

	function massageError(error: Error & { code?: string }): Error {
		if (error.code === 'ENOENT') {
			return vscode.FileSystemError.FileNotFound();
		}

		if (error.code === 'EISDIR') {
			return vscode.FileSystemError.FileIsADirectory();
		}

		if (error.code === 'EEXIST') {
			return vscode.FileSystemError.FileExists();
		}

		if (error.code === 'EPERM' || error.code === 'EACCESS') {
			return vscode.FileSystemError.NoPermissions();
		}

		return error;
	}

	export function checkCancellation(token: vscode.CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new Error('Operation cancelled');
		}
	}

	export function normalizeNFC(items: string): string;
	export function normalizeNFC(items: string[]): string[];
	export function normalizeNFC(items: string | string[]): string | string[] {
		if (process.platform !== 'darwin') {
			return items;
		}

		if (Array.isArray(items)) {
			return items.map(item => item.normalize('NFC'));
		}

		return items.normalize('NFC');
	}

	export function readdir(path: string): Promise<string[]> {
		return new Promise<string[]>((resolve, reject) => {
			fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
		});
	}

	export function stat(path: string): Promise<fs.Stats> {
		return new Promise<fs.Stats>((resolve, reject) => {
			fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
	}

	export function readfile(path: string): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
		});
	}

	export function writefile(path: string, content: Buffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function exists(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.exists(path, exists => handleResult(resolve, reject, null, exists));
		});
	}

	export function rmrf(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			rimraf(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			mkdirp(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function rename(oldPath: string, newPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function unlink(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
		});
	}
}

export class FileStat implements vscode.FileStat {

	constructor(private fsStat: fs.Stats) { }

	get type(): vscode.FileType {
		return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
	}

	get isFile(): boolean | undefined {
		return this.fsStat.isFile();
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.isDirectory();
	}

	get isSymbolicLink(): boolean | undefined {
		return this.fsStat.isSymbolicLink();
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		return this.fsStat.ctime.getTime();
	}

	get mtime(): number {
		return this.fsStat.mtime.getTime();
	}
}