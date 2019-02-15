/*
 *   Copyright 2018, Cordite Foundation.
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */
const Proxy = require('braid-client').Proxy
const fetch = require('node-fetch')
const fs = require('fs')
const readline = require('readline')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
})

const node = 'https://amer-test.cordite.foundation:8080/api/'
const emea = new Proxy({ url: node }, onOpen, onClose, onError, { strictSSL: false })
const banks = ['DBS', 'UOB', 'OCBC', 'HSBC', 'CIMB']
const notary = "OU=Cordite Foundation, O=Cordite Guardian Notary, L=London, C=GB"

let saltedDaoName = 'testDao-' + new Date().getTime()
let tokenName = "SGD"

function onOpen() {
    console.log("Connected to Node!")

    rl.question('Please enter your Bankfunds Account ID: ', sender => {
        rl.question('Please enter amount to transfer: ', amount => {
            rl.question('Please enter receiver\'s ID: ', receiver => {
                proc(sender, amount, receiver)
            })
        })
    })
}

function proc(sender, amt, receiver) {
    let gridlock_res_txns = []

    console.log("Executing transfer of  " + tokenName + " " + amt + " from " + sender + " to " + receiver + "...")
    return emea.ledger.balanceForAccount(sender)
        .then(b => {
            return emea.ledger.transferToken(amt, tokenName + ":0:OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US",
                sender, + " " + receiver + "@OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US", "Transfer",
                notary)
            let bal = (b[0].quantity * b[0].displayTokenSize) + " " + b[0].token.symbol
            console.log("Balance of " + bal + " is sufficient for transfer of  " + amt + " " + tokenName)
        }).then(c => {
            console.log("Transaction has been executed successfully!")
            console.log("===END===")
        }).catch(error => {
            let data = '\r\n' + sender + ", " + receiver + ", " + amt
            fs.appendFile('queued_payments/' + sender + '.csv', data, err => {
                if (err) throw err;
            })
            console.log('Payment instruction is queued due to insufficient balance.')
            console.log(error)

            banks.forEach(me => {
                banks.forEach(other => {
                    if (me != other) {
                        let txns = fs.readFileSync('queued_payments/' + other + '.csv', 'utf8')
                        let lines = txns.split('\r\n')
                        lines.forEach(line => {
                            let value = line.split(', ')
                            if (value[1] == me) {
                                gridlock_res_txns.push([value[0], value[1], value[2]])
                                console.log(gridlock_res_txns)
                            }
                        })
                    }
                })
            })

            console.log('Sending transactions to Cycle Solver API to determine optimal Gridlock Resolution Cycle...')
            let url = 'https://api.casebearer.com/cyclesolver-algo'
            data = gridlock_res_txns

            fetch(url, {
                method: 'GET', // or 'PUT'
                headers: {
                    data: data
                }
            }).then(res => {
                res.json()
            }).then(response => {
                console.log('Optimal Gridlock Resolution Cycle has been retrieved!' + '\r\n\r\n' + 'State of Balances of Accounts before Gridlock Resolution:' + '\r\n' + JSON.stringify(response['before_balances']) +
                    '\r\n\r\n' + 'Transactions to be resolved in this cycle: ' + '\r\n' + JSON.stringify(response['gridlock_resolution']['netting_txns'])
                    + '\r\n\r\n' + 'Atomic netting transactions to resolve current gridlock cycle: ' + '\r\n'
                    + JSON.stringify(response['gridlock_resolution']['atomic_netting_txns']) + '\r\n\r\n' + 'Possible Unilateral payments to further resolve gridlock cycle: '
                    + '\r\n' + JSON.stringify(response['gridlock_resolution']['unilateral_payments']) + '\r\n\r\n' + 'Outstanding transactions not resolved: '
                    + '\r\n' + JSON.stringify(response['gridlock_resolution']['outstanding_txns']) + '\r\n\r\n')
            }).catch(error => {
                console.error('Error:', error)
            })

            // let url = 'https://api.casebearer.com/cyclesolver-algo'
            // data = gridlock_res_txns

            fetch(url, {
                method: 'GET', // or 'PUT'
                headers: {
                    data: data
                }
            }).then(res => {
                res.json()
            }).then(response => {
                const gr_res = response['gridlock_resolution']

                setTimeout(() => {
                    console.log('Initiating Gridlock Resolution Settlement on Cordite: ')
                    gr_res['atomic_netting_txns'].forEach(txn => {
                        const sender = JSON.stringify(txn['from'])
                        const receiver = JSON.stringify(txn['to'])
                        const amount = JSON.stringify(txn['amt'])
                        console.log('atomic_netting_txns: ' + sender + ', ' + receiver + ', ' + amount)

                        //initiate transferToken function for this txn
                        emea.ledger.transferToken(amount, tokenName + ":0:OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US",
                            sender, + " " + receiver + "@OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US", "Transfer",
                            notary)
                    })
                }, 3000)

                setTimeout(() => {
                    console.log('\r\n' + 'Initiating Unilateral Settlement on Cordite: ')
                }, 4000)

                setTimeout(() => {
                    for (i = 0; i < response['gridlock_resolution']['unilateral_payments'].length; i++) {
                        let sender = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['from'])
                        let receiver = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['to'])
                        let amount = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['amt'])
                        console.log('unilateral_payments: ' + sender + ', ' + receiver + ', ' + amount)
                        //initiate transferToken function for this txn
                        emea.ledger.transferToken(amount, tokenName + ":0:OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US",
                            sender, + " " + receiver + "@OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US", "Transfer",
                            notary)
                    }
                }, 6000)

                setTimeout(() => {
                    console.log('\r\n' + 'GRIDLOCK RESOLUTION HAS BEEN SUCCESSFULLY EXECUTED. ' + '\r\n' + '===END===')
                }, 7000)

            }).catch(error => {
                console.error('Error:', error)
            })
        })
}

function onClose() {
    console.log("closed")
}

function onError(err) {
    console.error(err)
}