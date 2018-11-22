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
const Proxy = require('braid-client').Proxy;
const emea = new Proxy({url: 'https://amer-test.cordite.foundation:8080/api/'}, onOpen, onClose, onError, {strictSSL: false})

let saltedDaoName = 'testDao-'+new Date().getTime()
let sender = ''
let amt = ''
let receiver =''
let tokenName = "SGD"
let atomic_netting_txns 
let notary = "OU=Cordite Foundation, O=Cordite Guardian Notary, L=London, C=GB"



function onOpen() {

    const readline = require('readline');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    console.log("Connected to Node!")

    

    rl.question('Please enter your Bankfunds Account ID: ', (answer1) => {
        rl.question('Please enter amount to transfer: ', (answer2) => {
            rl.question('Please enter receiver\'s ID: ', (answer3) => {
                sender = answer1,
                amt = answer2,
                receiver = answer3,
                //banks = ['DBS', 'UOB', 'OCBC', 'HSBC', 'CIMB']
                banks = ['DBS', 'UOB', 'OCBC', 'HSBC', 'CIMB'],
                txns ='',
                gridlock_res_txns =[]
               
                //console.log(amt," ,\""+ tokenName + ":0:OU=Cordite Foundation, O=Cordite APAC, L=Hong Kong, C=HK\"" + ", \"" + sender + "\", "
                //  + "\"" + receiver + "@OU=Cordite Foundation, O=Cordite APAC, L=Hong Kong, C=HK\", ", "\"Transfer\",",  
                //"\"OU=Cordite Foundation, O=Cordite Guardian Notary, L=London, C=GB\"")
                console.log("Executing transfer of  " + tokenName + " " + amt + " from " + sender + " to " + receiver + "...")
                return emea.ledger.balanceForAccount(sender)
                .then( b => {   
                    return emea.ledger.transferToken(amt, tokenName +":0:OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US",
                    sender, + " " + receiver + "@OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US", "Transfer", 
                    "OU=Cordite Foundation, O=Cordite Guardian Notary, L=London, C=GB")
                     var bal = (b[0].quantity * b[0].displayTokenSize) + " " + b[0].token.symbol
                    console.log("Balance of " + bal + " is sufficient for transfer of  "+ amt + " " + tokenName)
                   
                }).then( c=> {

                     console.log("Transaction has been executed successfully!")
                      console.log("===END===")
                
                


                }).catch(error => {
                    var fs = require('fs')
                    var data = '\r\n' + sender + ", " + receiver + ", " + amt
                    fs.appendFile('queued_payments/' + sender+ '.csv', data, err => {
                        if (err) throw err;
                    });
                    console.log('Payment instruction is queued due to insufficient balance.')
                    console.log(error)


                    for(i=0; i<banks.length; i++) {
                        currentBank = banks[i]
                        for(j=0; j<banks.length; j++) {
                            if(banks[i]!= banks[j]) {
                                var fs = require('fs')
                                txns = fs.readFileSync('queued_payments/'+ banks[j]+ '.csv','utf8')
                                var temp = new Array();
                                var lines = txns.split('\r\n');
                                for(var k = 0; k < lines.length; k++){
                                    var value = lines[k].split(', ');
                                    //Retrieve receiver 
                                    //console.log(value[1])
                                    //console.log(currentBank)
                                    //console.log(value[1]==currentBank)
                                    if(value[1]==currentBank){
                                        gridlock_res_txns.push([value[0],value[1],value[2]])
                                        console.log(gridlock_res_txns)

                                    }
                                }
                            }
                        }
                    }
                  
                    console.log('Sending transactions to Cycle Solver API to determine optimal Gridlock Resolution Cycle...')
                    const fetch = require('node-fetch')
                    var url = 'https://api.casebearer.com/cyclesolver-algo';
                    data = gridlock_res_txns;

                    fetch(url, {
                      method: 'GET', // or 'PUT'
                      headers:{
                        data: data

                      }
                    }).then(res => res.json())
                    .then(response =>{ 
                        console.log('Optimal Gridlock Resolution Cycle has been retrieved!' + '\r\n\r\n' + 'State of Balances of Accounts before Gridlock Resolution:' + '\r\n' + JSON.stringify(response['before_balances']) +
                        '\r\n\r\n' + 'Transactions to be resolved in this cycle: ' + '\r\n' + JSON.stringify(response['gridlock_resolution']['netting_txns'])
                        + '\r\n\r\n' + 'Atomic netting transactions to resolve current gridlock cycle: ' + '\r\n' 
                        + JSON.stringify(response['gridlock_resolution']['atomic_netting_txns']) + '\r\n\r\n' + 'Possible Unilateral payments to further resolve gridlock cycle: '
                         + '\r\n' + JSON.stringify(response['gridlock_resolution']['unilateral_payments']) + '\r\n\r\n' + 'Outstanding transactions not resolved: ' 
                         +'\r\n' + JSON.stringify(response['gridlock_resolution']['outstanding_txns']) + '\r\n\r\n')

                    }).catch(error => console.error('Error:', error))

                   
                    
                    var url = 'https://api.casebearer.com/cyclesolver-algo';
                    data = gridlock_res_txns;

                    fetch(url, {
                        method: 'GET', // or 'PUT'
                        headers:{
                            data: data

                        }
                    }).then(res => res.json())
                    .then(response => {
                        setTimeout(function(){
                            console.log('Initiating Gridlock Resolution Settlement on Cordite: ');
                            for(i=0; i<response['gridlock_resolution']['atomic_netting_txns'].length; i++){
                                var sender = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['from'])
                                var receiver = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['to'])
                                var amount = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['amt'])
                                console.log('atomic_netting_txns: ' + sender + ', ' + receiver + ', ' + amount)
                                //initiate transferToken function for this txn
                                emea.ledger.transferToken(amount, tokenName +":0:OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US",
                                sender, + " " + receiver + "@OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US", "Transfer", 
                                "OU=Cordite Foundation, O=Cordite Guardian Notary, L=London, C=GB")


                            }
                        },3000)
                        
                        setTimeout(function(){
                            console.log('\r\n'+ 'Initiating Unilateral Settlement on Cordite: ')
                        },4000)


                        setTimeout(function(){
                            for(i=0; i<response['gridlock_resolution']['unilateral_payments'].length; i++){
                                var sender = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['from'])
                                var receiver = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['to'])
                                var amount = JSON.stringify(response['gridlock_resolution']['atomic_netting_txns'][i]['amt'])
                                console.log('unilateral_payments: ' + sender + ', ' + receiver + ', ' + amount)
                                //initiate transferToken function for this txn
                                emea.ledger.transferToken(amount, tokenName +":0:OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US",
                                sender, + " " + receiver + "@OU=Cordite Foundation, O=Cordite AMER, L=New York City, C=US", "Transfer", 
                                "OU=Cordite Foundation, O=Cordite Guardian Notary, L=London, C=GB")
                            }
                        },6000)


                        setTimeout(function(){
                            console.log('\r\n'+ 'GRIDLOCK RESOLUTION HAS BEEN SUCCESSFULLY EXECUTED. ' + '\r\n'+ '===END===')
                        },7000)

                    }).catch(error => console.error('Error:', error))
                    
                })
            })
        })
    });
}

function onClose() {
    console.log("closed")
}

function onError(err) {
    console.error(err)
}