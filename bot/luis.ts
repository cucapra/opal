/**
 * Utilities for interacting with LUIS.
 */
import * as botbuilder from 'botbuilder';
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
  value: any;
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
 * Get a date from a LUIS response.
 */
export function getDate(res: Response): Date {
  // Get the date from the LUIS response.
  let dateEntities = botbuilder.EntityRecognizer.findAllEntities(
    res.entities, "builtin.datetime.date"
  );
  if (dateEntities.length >= 1) {
    return botbuilder.EntityRecognizer.resolveTime(dateEntities);
  } else {
    return new Date();
  }
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
 * Get the most likely intent object from a LUIS response, or `null` if none
 * seems likely.
 */
export function likelyIntent(res: Response): Intent {
  // Get the most likely intent.
  let max_intent: Intent;
  let max_score: number;
  for (let intent of res.intents) {
    if (!max_intent || intent.score > max_score) {
      max_intent = intent;
      max_score = intent.score;
    }
  }

  // Max score too low?
  if (max_score < 0.1) {
    return null;
  } else {
    return max_intent;
  }
}
