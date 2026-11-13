'use strict';
const expected=require('../../config/production/runtime.json');
function validate(input){
    if(!input||JSON.stringify(input)!==JSON.stringify(expected))throw new Error('Explicit confirmed production configuration required.');
    return JSON.parse(JSON.stringify(input));
}
module.exports={validate};
