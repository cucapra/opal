/**
 * Utilities for interacting with LUIS.
 */
const request = require('request');

/**
 * The response from a LUIS query.
 */
export interface Response {
  query: string;
  intents: Intent[];
  entities: Entity[];
}

export interface Intent {
  intent: string;
  score: number;
  actions?: Action[];
}

export interface Action {
  triggered: boolean;
  name: string;
  parameters: Parameter[];
}

export interface Parameter {
  name: string;
  required: boolean;
  value: ParamValue[];
}

export interface ParamValue {
  entity: string;
  type: string;
  score: number;
  resolution?: any;
}

export interface Entity {
  entity: string;
  type: string;
  startIndex: number;
  endIndex: number;
  score: number;
  resolution?: any;
}

/**
 * Send a query to LUIS and return its complete API response.
 */
export function query(endpoint: string, text: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    let queryURL = endpoint + '&q=' + encodeURIComponent(text);
    request(queryURL, (err, res, body) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(body));
      }
    });
  });
}

/**
 * `max`, except for the `score` field.
 */
function maxScore<T extends { score: number }>(xs: T[]): T {
  let max_value: T;
  for (let x of xs) {
    if (!max_value || x.score > max_value.score) {
      max_value = x;
    }
  }
  return max_value;
}

/**
 * Get the most likely intent object from a LUIS response, or `null` if none
 * seems likely.
 */
export function likelyIntent(res: Response): Intent {
  // Get the most likely intent.
  let max_intent = maxScore(res.intents);

  // Max score too low?
  if (max_intent.score < 0.1) {
    return null;
  } else {
    return max_intent;
  }
}

/**
 * Get the triggered action, if any, in an intent. Optionally specific the
 * name of the expected action. Return null if there is no matching triggered
 * intent.
 */
export function triggered(intent: Intent, name?: string): Action {
  if (!intent.actions) {
    return null;
  }

  for (let action of intent.actions) {
    if (action.triggered && (!name || name === action.name)) {
      return action;
    }
  }

  return null;
}

/**
 * Get the parameters from an Action as a key/value-list map.
 */
export function params(action: Action): { [name: string]: ParamValue[] } {
  let out: { [name: string]: ParamValue[] } = {};
  for (let param of action.parameters) {
    out[param.name] = param.value;
  }
  return out;
}

/**
 * Get the most likely value for each of an action's parameters.
 */
export function likelyParams(action: Action): { [name: string]: any } {
  let param_lists = params(action);
  let out: { [name: string]: any } = {};
  for (let key in param_lists) {
    let param_list = param_lists[key];
    if (param_list) {
      let v = maxScore(param_lists[key]);
      out[key] = v.entity;
    } else {
      // Missing optional parameter.
      out[key] = null;
    }
  }
  return out;
}

/**
 * Parse a YYYY-MM-DD date from a LUIS entity resolution.
 */
export function parseDate(s: string): Date {
  let parts = s.split('-');

  let year = parseInt(parts[0]);
  let month = parseInt(parts[1]);
  let day = parseInt(parts[2]);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    console.error("invalid date:", s);
    return new Date();
  }

  let d = new Date();
  d.setFullYear(year);
  d.setMonth(month - 1);
  d.setDate(day);
  return d;
}

/**
 * Get the `Date` specified by a LUIS datetime parameter. If no date is
 * specified, return the current date.
 */
export function dateParam(action: Action, name: string): Date {
  let param = params(action)[name];
  if (!param) {
    return new Date();
  }
  return parseDate(param[0].resolution.date);
}
