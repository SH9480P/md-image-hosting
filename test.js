const regex = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) [^\s]+ HTTP\/[0-9.]+\r?\n(?:[A-Za-z-]+: .*\r?\n)*\r?\n$/

const test = '123'
test[0]='2'
console.log(test)