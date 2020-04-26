#!/usr/bin/env node
'use strict';
const HTTP2 = require('http2');
const FS = require('fs');
const conf = require('./conf.json');
const debug = require('debug')('adv');
const Path = require('path');
const	MIME = require('mime-types');
const Util = require('util');
const stat = Util.promisify(FS.stat);
const ETag = require('etag');
const fresh = require('fresh');
const pkg = require('./package.json');

const log = console.log.bind(console);
const textplain = "text/plain; charset=UTF-8";
const servername = `${pkg.name} ${pkg.version}`;

function Err404( path ){
	const error = Error( `${path} not found` );
	error.code = 'ENOENT';
	error.path = path;
	return error;
}

class Server {
	constructor(){
		const listener = this.listener = HTTP2.createSecureServer({
			key: FS.readFileSync(conf.server.keyFile),
			cert: FS.readFileSync(conf.server.certFile)
		});

		this.handlers = [];
		this.errorhandlers = {on404:[],on500:[]};
		listener.on('request', this.dispatch());
	}

	dispatch(){
		return async (req,res) =>{
			try {
				const urlstr = `${req.scheme}://${req.authority}${req.url}`;
				log(req.method, urlstr);
				req.urlobj = new URL(urlstr);
				res.setHeader('Server', servername);
				
				//Object.assign(res,resultMixin);
				
				let done = false;
				for( const handler of this.handlers ){
					//log('run handler', handler);
					await handler( req, res );
					if( res.writableEnded ){
						//log('req done', res.statusCode);
						done = true;
						break;
					}
				}

				if( !done ){
					log('fallback 404');
					res.writeHead(404, {'content-type': textplain});
					res.end("404 no handler");
				}
			} catch( err ){
				if( err.code === 'ENOENT' ){
					res.statusCode = 404;
					for( const errhand of this.errorhandlers.on404 ){
						await errhand( err, req, res );
						if( res.writableEnded ) return;
					}
				}
				
				res.statusCode = 500;
				for( const errhand of this.errorhandlers.on500 ){
					await errhand( err, req, res );
					if( res.writableEnded ) return;
				}

				this.respond500( err, req, res );
			}
		}
	}

	respond500( err, req, res ){
		console.error('Internal server error', err);
		res.writeHead(500, {'content-type': textplain});
		res.end("Internal server "+ err.toString());
	}

	async start(){
		this.listener.listen( conf.server.port );
	}

	use( handler ){
		//log('adding handler', handler);
		this.handlers.push( handler );
	}

	on404( errhandler ){
		this.errorhandlers.on404.push( errhandler );
	}
	
	async canonical(req, res, root){
		//log('canonical');
		const url = req.urlobj;
		let canonical = url.pathname.replace(/\/index.html$/, '/');
		const fullPath = Path.join(root, canonical );
		if( (await stat(fullPath)).isDirectory() ){
			canonical = canonical.replace(/\/?$/,'/');
		}

		if( canonical === url.pathname ) return;
		const path = canonical + url.search + url.hash;
		debug('REDIRECT', path);
		res.writeHead(302, {'Location': path});
		res.end();
	}

	static( root ){
		const app = this;
		log('Servning files from', root);
		return async (req,res)=>{
			//log('looking up', req.urlobj.toString());

			await app.canonical( req, res, root );
			if( res.writableEnded ) return;
			
			let fullPath = Path.join(root, req.urlobj.pathname);
			fullPath = fullPath.replace(/\/$/,'/index.html');
			//log('Looking up', fullPath);
			
			const stats = await stat(fullPath);
			if( !stats.isFile() ) throw Err404(req.urlobj.pathname);
			res.statusCode = 200;
			await app.sendFile( req, res, fullPath );
		}
	}

	async sendFile( req, res, path ) {
		//log('Sending', path);
		const stats = await stat(path);
		if( !stats.isFile() ) throw "file not found";
		const etag = ETag(stats);
		const date = stats.mtime.toUTCString();

		if( fresh( req.headers, {etag, 'last-modified': date})){
			res.statusCode = 304;
			return res.end();
		}

		const responseMimeType = MIME.lookup(path);
		res.setHeader( 'Content-Type', responseMimeType );
		res.setHeader( 'Content-Length', stats.size );
		res.setHeader( 'ETag', etag );
		res.setHeader( 'Last-Modified', date );
		res.flushHeaders();
		const readStream = FS.createReadStream(path);
		readStream.pipe(res);

		await new Promise( (resolve,reject)=>{
			readStream.on("close", resolve );
			readStream.on('error', reject );
		});
		res.end();
	}
}

main();

async function main(){
	const app = new Server();

	app.use( app.static('./public') );
	app.on404( async (err, req, res)=>{
		await app.sendFile( req, res, "./public/404.html");
	});

	await app.start();
	log(`Started ${servername} on port ${conf.server.port}`);
}

