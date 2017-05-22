import { Either } from "./either";
import * as opal from "./opal";
import * as PSet from './pset';
import { World, TopWorld, Weight, Collection, Edit } from './world';
import * as util from "./util";

import * as http from "http";
import * as url from "url";

export abstract class OpalNode {
    constructor(public readonly hostname: string, public readonly port: number) {

    }
}

/**
 * Launch the Opal server, accepting requests to run remote code locally.
 * @param port  The port to launch the server on. Error if the port is out of bounds
 *                or already in use.
 * @returns     description of the error on on error, otherwise never returns.
 */
export async function launchOpalServer(port: number, addr?: string): Promise<string | never> {
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

    while (true) {
        // handle each request as it comes
        let [name, [req, resp]] = await util.eventToPromise<[http.IncomingMessage, http.ServerResponse]>(server, "request");
        await handleRequest(req, resp);
    }
}

async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
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
            await executeEndpoint(data, response);
            break;
        default:
            response.writeHead(404);
            response.end();
    }
}

interface ExecuteArg {
    code: (ctx: opal.Context, ...params: any[]) => Promise<void>;
    params: [string, (Weight<any> | Collection<any>)][];
}

interface ExecuteResponse {
    params: {
        [name: string]: any
    };
}

async function executeEndpoint(data: string, response: http.ServerResponse) {
    let topworld: World = new TopWorld(async () => {
        let executeArg = deserializeExecuteArg(data, topworld);
        let ctx = new opal.Context(topworld);
        let subWorld = ctx.hypothetical(async (ctx: opal.Context) => {
            let realArgs = executeArg.params.map((a: [string, Weight<any> | Collection<any>]) => a[1]);
            await executeArg.code(ctx, ...realArgs);
        });
        subWorld.acquire();
        await subWorld.finish();

        let resp: ExecuteResponse = { params: {} };
        for (let [name, val] of executeArg.params) {
            console.log(`Setting ${name} = ${JSON.stringify(val)}: ${typeof val}, ${val instanceof Weight}`);
            if (val instanceof Weight) {
                await val.get(subWorld).then((v: any) => resp.params[name] = v, () => { });
            } else {
                resp.params[name] = PSet.diff(val.lookup(ctx.world), val.lookup(subWorld));
            }
        }
        response.end(JSON.stringify(resp), (key: any, value: any) => {
            if (value instanceof PSet.Add) {
                return { __opal_type: "Add", value: value.value };
            } else if (value instanceof PSet.Delete) {
                return { __opal_type: "Delete", value: value.value };
            } else {
                return value;
            }
        });
    });
    topworld.acquire();
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
                default:
                    throw Error(`Invalid opal type ${value["__opal_type"]}`);
            }
        }
        return value;
    });

    // TODO: the line below is not at all safe
    parsed.code = eval(parsed.code);

    return parsed as ExecuteArg;
}

export async function executeAt(ctx: opal.Context, node: OpalNode, func: (ctx: opal.Context, ...params: (Weight<any> | Collection<any>)[]) => Promise<void>, params: [string, (Weight<any> | Collection<any>)][]) {
    let arg: ExecuteArg = {
        code: func,
        params: params
    };
    let data = serializeExecuteArg(arg, ctx.world);
    let response = await sendDataToNode(node, "execute", "POST", data);
    let respParams = JSON.parse(response, (name: any, value: any) => {
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
    }).params;
    for (let name in respParams) {
        // TODO: n^2, can be n
        for (let [o_name, o_val] of params) {
            if (o_name !== name) {
                continue;
            }
            if (o_val instanceof Weight) {
                ctx.set(o_val, respParams[name]);
            } else {
                let val = respParams[name] as PSet.Operation<any>[];
                new opal.Edit(val).foreach({
                    add(value) {
                        ctx.add(o_val as Collection<any>, value);
                    },
                    delete(value) {
                        ctx.del(o_val as Collection<any>, value);
                    }
                });
            }
            break;
        }
    }
}

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
        } else {
            return value;
        }
    });
}

async function sendDataToNode(node: OpalNode, endpoint: string, method: string, data: string) {
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
