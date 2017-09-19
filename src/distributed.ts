import { Either } from "./either";
import * as opal from "./opal";
import * as PSet from "./pset";
import { World, TopWorld, Weight, Collection, Edit } from "./world";
import * as util from "./util";

import * as http from "http";
import * as process from "process";
import * as readline from "readline";
import * as url from "url";
import * as uuid from "uuid/v4";

export interface RemoteOpalNode {
    readonly hostname: string;
    readonly port: number;
}

export abstract class OpalNode implements RemoteOpalNode {
    private tokens: { [token: string]: null } = {};

    constructor(public readonly hostname: string, public readonly port: number) {
    }

    public storeToken(token: string) {
        this.tokens[token] = null;
    }

    public hasToken(token: string) {
        return this.tokens[token] === null;
    }
}

/**
 * Launch the Opal server, accepting requests to run remote code locally.
 * @param port  The port to launch the server on. Error if the port is out of bounds
 *                or already in use.
 * @returns     description of the error on on error, otherwise never returns.
 */
export async function launchOpalServer(node: OpalNode): Promise<string | never> {
    let port = node.port;
    let addr = node.hostname;

    if (port < 0 || port >= 65536) {
        return `Port ${port} is not in range [0, 65536)`;
    }

    const server = http.createServer();
    if (addr === undefined) {
        addr = "0.0.0.0";
    }

    server.listen(port, addr, undefined);

    // wait until the server actually launches
    let err = await new Promise<Error | void>((resolve, reject) => {
        server.once("listening", resolve);
    });
    if (err) {
        return `An error occurred while launching the Opal runtime: ${err}`;
    }

    console.log(`Server is listening on http://${server.address().address}:${server.address().port}`);

    let promises = [];

    while (true) {
        let [name, [req, resp]] = await util.eventToPromise<[http.IncomingMessage, http.ServerResponse]>(server, "request");
        promises.push(handleRequest(node, req, resp).catch(() => { }));
    }
}

async function handleRequest(node: OpalNode, request: http.IncomingMessage, response: http.ServerResponse) {
    let body: Buffer[] = [];

    let still_collecting = true;

    do {
        let [ev, args] = await util.eventToPromise<[Buffer]>(request, "data", "close", "end");

        if (ev === "data") {
            body.push(args[0]);
        } else {
            still_collecting = false;
        }
    } while (still_collecting);

    let data = Buffer.concat(body).toString();
    let req_url = url.parse(request.url as string, true);
    switch (req_url.pathname) {
        case "/execute":
            await executeEndpoint(node, data, response);
            break;
        case "/tokenize":
            await tokenizeEndpoint(node, data, request, response);
            break;
        case "/access":
            await accessEndpoint(node, data, response);
            break;
        default:
            response.writeHead(404);
            response.end();
    }
}

// an OpalEntity is a value that persists across distributed worlds
export type OpalEntity = Weight<any> | Collection<any> | OpalNode;
export type OpalEntityMap = [string, OpalEntity][];
export type OpalRemoteFunction = (ctx: opal.Context, ...params: OpalEntity[]) => Promise<void>;

interface ExecuteArg {
    code: OpalRemoteFunction;
    params: OpalEntityMap;
}

interface ExecuteResponse {
    [name: string]: any;
}

// TODO: serialization is hard. Should we allow serialization of code / closures?
function serializeExecuteArg(arg: ExecuteArg, world: opal.World) {
    let code = arg.code.toString();

    return JSON.stringify({
        code: code,
        params: arg.params
    }, (key: any, value: any) => {
        if (value instanceof opal.Weight) {
            return { __opal_type: "Weight" };
        } else if (value instanceof opal.Collection) {
            return {
                __opal_type: "Collection",
                __opal_val: value.lookup(world)
            };
        } else if (value instanceof PSet.Node) {
            return {
                __opal_type: "Node",
                __opal_val: value.view()
            };
        } else if (value instanceof OpalNode ||
            value.__opal_is_untokenized_remote === true) {
            return {
                __opal_type: "UntokenizedRemoteNode",
                hostname: value.hostname,
                port: value.port
            };
        } else if (value.__opal_is_tokenized_remote === true) {
            console.log(`Serializing ${value.port} as TokenizedRemoteNode`);
            return {
                __opal_type: "TokenizedRemoteNode",
                token: value.__opal_tokenized_remote_token,
                hostname: value.hostname,
                port: value.port
            };
        } else if (typeof value === "function") {
            throw new Error("Code shipping is not supported, weights/collections passed over the wire may only contain data.");
        } else {
            return value;
        }
    });
}

function deserializeExecuteArg(serialized: string, world: opal.World) {
    let parsed = JSON.parse(serialized, (key: any, value: any) => {
        if (typeof value === "object" &&
            "__opal_type" in value) {
            switch (value["__opal_type"]) {
                case "Weight":
                    return new opal.Weight(world);
                case "Collection":
                    return new opal.Collection(world, value["__opal_val"]);
                case "Node":
                    return PSet.set(value["__opal_val"]);
                case "UntokenizedRemoteNode":
                    return {
                        hostname: value.hostname,
                        port: value.port
                    };
                case "TokenizedRemoteNode":
                    return tokenizeRemoteNode({ hostname: value.hostname, port: value.port }, value.token);
                default:
                    throw Error(`Invalid opal type "${value["__opal_type"]}"`);
            }
        }
        return value;
    });

    // TODO: the line below is not at all safe
    parsed.code = eval(parsed.code);

    return parsed as ExecuteArg;
}

async function executeEndpoint(localNode: OpalNode, data: string, response: http.ServerResponse) {
    let topworld: World = new TopWorld(async () => {
        let ctx = new opal.Context(topworld, localNode);

        let executeArg = deserializeExecuteArg(data, topworld);

        let realArgs = executeArg.params.map((a: [string, OpalEntity]) => a[1]);
        let subWorld = ctx.hypothetical(async (ctx: opal.Context) => {
            await executeArg.code(ctx, ...realArgs);
        });
        subWorld.acquire();
        await subWorld.finish();

        let resp: ExecuteResponse = {};
        for (let [name, val] of executeArg.params) {
            if (val instanceof Weight) {
                await val.get(subWorld)
                    .then((val) => { resp[name] = val; })
                    .catch(() => { console.log(`No value set for ${name}`); });
            } else if (val instanceof Collection) {
                resp[name] = PSet.diff(val.lookup(ctx.world), val.lookup(subWorld));
            }
        }

        response.end(JSON.stringify(resp, (name: any, value: any) => {
            if (value instanceof PSet.Add) {
                return {
                    __opal_type: "Add",
                    __opal_val: value.value
                };
            } else if (value instanceof PSet.Delete) {
                return {
                    __opal_type: "Delete",
                    __opal_val: value.value
                };
            } else {
                return value;
            }
        }));
    });
    topworld.acquire();
}

export async function executeAt(ctx: opal.Context, node: OpalNode, func: OpalRemoteFunction, params: OpalEntityMap) {
    let arg: ExecuteArg = {
        code: func,
        params: params
    };
    let data = serializeExecuteArg(arg, ctx.world);
    let response = await sendDataToNode(node, "execute", "POST", data);
    let resp: ExecuteResponse = JSON.parse(response, (name: any, value: any) => {
        if (typeof value === "object" &&
            "__opal_type" in value) {
            switch (value["__opal_type"]) {
                case "Add":
                    return new PSet.Add(value["value"]);
                case "Delete":
                    return new PSet.Delete(value["value"]);
                default:
                    throw Error(`Invalid opal type ${value["__opal_type"]}`);
            }
        }
        return value;
    });

    // preprocess the params into a dict for easier updating
    let paramsDict = params.reduce((acc, [name, val]) => {
        acc[name] = val;
        return acc;
    }, {} as { [name: string]: OpalEntity });

    for (let resp_name in resp) {
        let opal_ent = paramsDict[resp_name];
        if (opal_ent instanceof Weight) {
            ctx.set(opal_ent, resp[resp_name]);
        } else if (opal_ent instanceof Collection) {
            let val = resp[resp_name] as PSet.Operation<any>[];
            new opal.Edit(val).foreach({
                add(value) {
                    ctx.add(opal_ent as Collection<any>, value);
                },
                delete(value) {
                    ctx.del(opal_ent as Collection<any>, value);
                }
            });
        } else {
            throw Error(`Unknown type for "${resp_name}": "${opal_ent}"`);
        }
    }
}

function sendDataToNode(node: RemoteOpalNode, endpoint: string, method: string, data: string) {
    let options = {
        hostname: node.hostname,
        port: node.port,
        path: `/${endpoint}`,
        method: method
    } as http.RequestOptions;

    return new Promise<string>((resolve, reject) => {
        http.request(options, (res) => {
            let responseBody = "";
            res.setEncoding("utf8");
            let running = true;
            res.on("data", (chunk) => { responseBody += chunk; });
            res.on("end", () => {
                if (res.statusCode === 200) {
                    resolve(responseBody);
                } else if (res.statusCode === 400) {
                    reject(`Remote failed to parse with ${responseBody}`);
                } else {
                    reject(`Remote rejected with ${responseBody}`);
                }
            });
        }).on("error", (e) => {
            reject(`Problem with request: ${e.message}`);
        }).end(data);
    });
}

interface TokenizeRequest {
    id: string;
    request: string;
}

interface TokenizeResponse {
    token: string | null;
}


async function tokenizeEndpoint(localNode: OpalNode, data: string, request: http.IncomingMessage, response: http.ServerResponse) {
    let tokenizeRequest: TokenizeRequest = JSON.parse(data);
    console.log(`Node ${tokenizeRequest.id} is requesting access to:\n${tokenizeRequest.request}`);
    let rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.setPrompt(`Grant? (y/n) `);
    let grant: boolean;

    prompt:
    while (true) {
        rl.prompt();
        let [_, [line]] = await util.eventToPromise<[string]>(rl, "line");
        switch (line) {
            case "yes":
            case "y":
                grant = true;
                break prompt;
            case "no":
            case "n":
                grant = false;
                break prompt;
        }
    }
    rl.close();

    let token: string | null;
    if (grant) {
        token = uuid();
        localNode.storeToken(token);
    } else {
        token = null;
    }

    let tokenizeResponse: TokenizeResponse = {
        token: token
    };

    response.end(JSON.stringify(tokenizeResponse));
}

export async function requestToken(local: OpalNode, remote: OpalNode, description: string) {
    let request: TokenizeRequest = {
        id: `${local.hostname}:${local.port}`,
        request: description
    };
    let response = await sendDataToNode(remote, "tokenize", "POST", JSON.stringify(request));
    let tokenizeResponse: TokenizeResponse = JSON.parse(response);
    if (tokenizeResponse.token === null) {
        throw Error(`Could not acquire an access token for ${description}`);
    } else {
        return tokenizeResponse.token;
    }
}

export function tokenizeRemoteNode(remote: RemoteOpalNode, token: string): RemoteOpalNode {
    return new Proxy<RemoteOpalNode>(
        {
        } as RemoteOpalNode, {
            get: (target: any, name: any) => {
                switch (name) {
                    case "hostname":
                        return remote.hostname;
                    case "port":
                        return remote.port;
                    case "__opal_is_tokenized_remote":
                        return true;
                    case "__opal_tokenized_remote_token":
                        return token;
                    case "toJSON":
                    case Symbol.toPrimitive:
                        return undefined;
                    default:
                        return async (...args: any[]) => {
                            return await accessRemoteFunction(remote, token, name, args);
                        };
                }
            }
        }
    );
}

interface AccessRequest {
     // TODO: this should include some information about the context
    accessToken: string;
    functionName: string;
    args: any[];
}

interface AccessResponse {
    success: boolean;
    result: any;
}

async function accessEndpoint(node: OpalNode, data: string, response: http.ServerResponse) {
    let request: AccessRequest = JSON.parse(data);
    let accessResponse: AccessResponse;
    let ctx = opal.topctx;

    if (node.hasToken(request.accessToken)) {
        let result = ctx.weight<any>();
        let world = ctx.hypothetical(async (ctx: opal.Context) => {
          ctx.set(result, await (node as any)[request.functionName](ctx, ...request.args.slice(1)));
        });
        ctx.commit(world);

        accessResponse = {
            success: true,
            result: await ctx.get(result, world),
        }
    } else {
        accessResponse = {
            success: false,
            result: null
        };
    }
    response.end(JSON.stringify(accessResponse));
}

async function accessRemoteFunction(remote: RemoteOpalNode, token: string, functionName: string, args: any[]) {
    let accessRequest: AccessRequest = {
        accessToken: token,
        functionName: functionName,
        args: args
    };

    let response = await sendDataToNode(remote, "access", "POST", JSON.stringify(accessRequest));
    let accessResponse: AccessResponse = JSON.parse(response);
    if (!accessResponse.success) {
        throw new Error(`Remote did not accept RPC`);
    } else {
        return accessResponse.result;
    }
}
