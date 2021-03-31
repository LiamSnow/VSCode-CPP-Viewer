import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';
import { ViewColumn } from 'vscode';
import { ThemeIcon } from 'vscode';
import { FSWatcher } from 'node:fs';

export class CPPViewProvider implements vscode.TreeDataProvider<Entry> {

	private _onDidChangeTreeData = new vscode.EventEmitter<Entry | undefined>();
	public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;  
	private workspaceFolder : vscode.WorkspaceFolder;
	private watcher : FSWatcher;

	constructor() {
		this.workspaceFolder = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file')[0]!;
		const workspaceUri = this.workspaceFolder.uri;

		this.watcher = fs.watch(workspaceUri.fsPath, { recursive: true }, async (event: string, filename: string | Buffer) => {
			this._onDidChangeTreeData.fire(undefined);
			// const filepath = path.join(workspaceUri.fsPath, _.normalizeNFC(filename.toString()));
			// const uri = workspaceUri.with({ path: filepath });
			
			// const stat = await _.stat(uri.fsPath);
			// this._onDidChangeTreeData.fire({
			// 	uri,
			// 	//type: event === 'change' ? vscode.FileChangeType.Changed : await _.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
			// 	type: stat.isFile() ? vscode.FileType.File : (stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.Unknown)
			// });
		});

		//this.watcher.close()
	}

	async getEntriesFromDir(baseUri: vscode.Uri): Promise<Entry[]> {
		const children = await _.readdir(baseUri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = new FileStat(await _.stat(path.join(baseUri.fsPath, child)));
			result.push([child, stat.type]);
		}

		return result
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
					type: (new FileStat((await _.stat(path.join(baseUri.fsPath, name))))).type
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

				//search for `include/` base directory
				const fsPath = element.uri.fsPath;
				const includeInd = fsPath.indexOf('include');
				if (includeInd != -1) {
					//add similar files in `cpp/` (if exist)
					const cppDir = path.join(
						fsPath.substring(0, includeInd), //before `include/` folder
						'\\cpp\\', //add `cpp/` folder
						//remove .h from fsPath, then get from after `include/` folder
						fsPath.slice(0, -path.extname(fsPath).length).substring(includeInd + 'include'.length) 
						) + '.cpp';
					if (fs.existsSync(cppDir)) {
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
			if (this.workspaceFolder) {
				return (await this.getEntriesFromDir(this.workspaceFolder.uri));
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

export class CPPView {
	treeDataProvider: CPPViewProvider;

	constructor(context: vscode.ExtensionContext) {
		this.treeDataProvider = new CPPViewProvider();
		context.subscriptions.push(vscode.window.createTreeView('cppView', { treeDataProvider: this.treeDataProvider }));
		vscode.commands.registerCommand('cppView.newFolder', (resource) => this.make(resource, 'folder'));
		vscode.commands.registerCommand('cppView.newGroup', (resource) => this.make(resource, 'group'));
		vscode.commands.registerCommand('cppView.delete', (resource) => this.delete(resource));
		vscode.commands.registerCommand('cppView.rename', (resource) => this.rename(resource));
		vscode.commands.registerCommand('cppView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('cppView.openFilesSplit', (resource1, resource2) => this.openFilesSplit(resource1, resource2));
	}

	private async make(resource: Entry, type: 'folder' | 'group'): Promise<void> {
		const fsPath = resource.uri.fsPath;
		const folderNames = [ 'cpp', 'include' ];
		const fileExts = [ '.cpp', '.h' ];
		const name = await vscode.window.showInputBox();

		if (name) {
			let paths = [];
			const children = await this.treeDataProvider.getEntriesFromDir(resource.uri);

			let creatingAtSplit = false;
			for (const child of children) {
				if (folderNames.includes(path.basename(child.uri.fsPath))) {
					creatingAtSplit = true;
				}
			}

			if (creatingAtSplit) {
				for (let i = 0; i < 2; i++) {
					const altPath = path.join(fsPath, folderNames[i], name) + ((type === 'group') ? fileExts[i] : '');
					if (type !== 'group' || 
						fs.existsSync(altPath.slice(0, -path.basename(altPath).length))) { //make sure this directory exists if adding group
						paths.push(altPath);
					}
				}
			}
			else {
				//creating normally
				paths.push(path.join(fsPath, name));
				for (let i = 0; i < 2; i++) {
					let foundInd = fsPath.indexOf(path.sep + folderNames[i] + path.sep) + 1;
					if (foundInd !== 0) { //0 because its indexOf() + 1
						//is under a cpp split
						const altPath = path.join(
							fsPath.substring(0, foundInd), //fsPath before folderName
							folderNames[Number(!i)], //add alt folderName
							fsPath.substring(foundInd + folderNames[i].length), //fsPath after folderName
							name) + (type === 'group' ? fileExts[Number(!i)] : ''); //new name + opt file ext;

						if (type !== 'group' || 
							fs.existsSync(altPath.slice(0, -path.basename(altPath).length))) { //make sure this directory exists if adding group
							paths.push(altPath);
						}
	
						if (type === 'group') {
							paths[0] += fileExts[i]; //add file extension to other path
						}
						break;
					}
				}
			}

			//write to all paths
			for (let i = 0; i < paths.length; i++) {
				try {
					if (type === 'folder') {
						fs.mkdirSync(paths[i]);
					} else {
						fs.writeFileSync(paths[i], '');
					}
				} catch (err) { console.error(err); }
			}
		}
	}

	private async delete(resource: Entry): Promise<void> {
		const altResource = await this.locateAltResource(resource);
		_.rmrf(resource.uri.fsPath);
		if (altResource) {
			_.rmrf(altResource.uri.fsPath);
		}
	}

	private async rename(resource: Entry, newName?: string): Promise<void> {
		const oldUri = resource.uri;
		const basename = path.basename(oldUri.fsPath);

		//also rename alt
		if (!newName) {
			const extname = path.extname(basename);
			const extnameLength = extname.length;
			let promptName = basename;
			if (extnameLength > 0) {
				promptName = basename.slice(0, -extnameLength);
			}
			const altResource = await this.locateAltResource(resource);
			if (altResource) {
				newName = await vscode.window.showInputBox({ value: promptName, valueSelection: undefined });
				this.rename(altResource, newName + path.extname(altResource.uri.fsPath));
				newName += extname;
			}
		}

		//rename this one
		if (!newName) {
			newName = await vscode.window.showInputBox({ value: basename, valueSelection: undefined });
		}
		const newUri = vscode.Uri.file(oldUri.fsPath.slice(0, -basename.length) + newName);
		if (fs.existsSync(newUri.fsPath)) {
			vscode.window.showErrorMessage("File Already Exists!");
		}
		if (!fs.existsSync(path.dirname(newUri.fsPath))) {
			await _.mkdir(path.dirname(newUri.fsPath));
		}
		return _.rename(oldUri.fsPath, newUri.fsPath);
	}

	/** Returns assosiated alt resource for entries under a cpp split */
	private async locateAltResource(resource: Entry): Promise<Entry | undefined> {
		const fsPath = resource.uri.fsPath;
		const folderNames = [ 'cpp', 'include' ];
		const fileExts = [ '.cpp', '.h' ];

		if (!resource.title) { //skip if this is a sub
			for (let i = 0; i < 2; i++) {
				const foundInd = fsPath.indexOf(path.sep + folderNames[i] + path.sep) + 1;
				const hasExt = path.extname(fsPath).length > 0;
				const fsPathNoExt = hasExt ? fsPath.slice(0, -path.extname(fsPath).length) : fsPath;
				const altFileExt = hasExt ? fileExts[Number(!i)] : '';
				if (foundInd !== 0) { //0 because indexOf() + 1
					const altFsPath = path.join(
						fsPath.substring(0, foundInd), //fsPath before folderName
						folderNames[Number(!i)], //add alt folderName
						fsPathNoExt.substring(foundInd + folderNames[i].length)) + altFileExt; //fsPath after folderName + altFileExt
					if (fs.existsSync(altFsPath)) {
						return { uri: vscode.Uri.file(altFsPath), type: resource.type };
					}
				}
			}
		}
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