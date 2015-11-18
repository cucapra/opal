'use strict';

function* foo() {
  console.log(2);
  yield 1;
}

let f = foo();
console.log(f.next());
