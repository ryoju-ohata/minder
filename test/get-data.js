/*!
 * minder
 * Copyright(c) 2018 Passionate Engineer Ryoju
 */

'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-1' });
const exec = require('exec');
const os = require('os');

const { IncomingWebhook } = require('@slack/client');
const webhook = new IncomingWebhook(process.argv[2]);

const RelatedKeyword = require('../lib/related-keyword');
const relatedKeyword = new RelatedKeyword();

const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const postSlack = message => {
  webhook.send(message, (err, res) => {
    if (err) {
      console.log('Error:', err);
    } else {
      console.log('Message sent: ', res);
    }
  });
};

let stack = [];
let count = 0;
let duplicate = 0;
let loopCount = 0;
let timeout = null;

const complete = () => {
  postSlack('Complete ' + os.hostname() + ' ' + duplicate + '/' + count);
  exec('sudo shutdown', () => {
    console.log('shutdown');
  });
};

const autoPutItem = keyword => {
  if (++loopCount > 10000) {
    complete();
    return;
  }

  console.log(
    count +
      1 +
      ':' +
      keyword +
      ' ' +
      String(new Date()).slice(16, 24) +
      ' ' +
      duplicate +
      '/' +
      count
  );

  let params = {
    TableName: 'minder',
    Key: {
      keyword: { S: keyword }
    }
  };

  dynamodb.getItem(params, async (err, res) => {
    if ((res && !res.Item) || count === 0) {
      // Timeout
      timeout = setTimeout(() => {
        complete();
      }, 60000);
      const relatedKeywords = await relatedKeyword.getKeywords(keyword);
      clearTimeout(timeout);

      const putRelatedKeywords = JSON.stringify(
        relatedKeywords.map(keyword => {
          return [keyword.keyword, keyword.value];
        })
      );

      params = {
        TableName: 'minder',
        Item: {
          keyword: { S: keyword },
          related_keywords: { S: putRelatedKeywords }
        }
      };

      dynamodb.putItem(params, (err, data) => {
        if (err) {
          console.log(err, err.stack);
        } else {
          count++;
          relatedKeywords.forEach(relatedKeyword => {
            stack.push(relatedKeyword.keyword);
          });
          stack.shift();
          shuffle(stack);
          stack.splice(100);
          autoPutItem(stack[0]);
        }
      });
    } else {
      console.log('重複');
      duplicate++;
      shuffle(stack);
      autoPutItem(stack[0]);
    }
  });
};

// autoPutItem();
const randomKeyword = callback => {
  let params = {
    TableName: 'minder',
    Limit: 1000
  };

  dynamodb.scan(params, async (err, res) => {
    if (err) {
      console.log(err, err.stack);
    } else {
      const randNum = Math.floor(Math.random() * 1000);
      callback(res.Items[randNum].keyword.S);
    }
  });
};

randomKeyword(keyword => {
  autoPutItem(keyword);
});
