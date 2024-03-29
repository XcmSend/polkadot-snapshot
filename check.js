import '@polkadot/api-augment/kusama'
import { WsProvider, ApiPromise } from "@polkadot/api";
import { Keyring } from '@polkadot/keyring';
// import fs from 'fs/promises';
import { BN, hexToNumber, bnToHex, hexToBigInt, u8aToHex } from "@polkadot/util";
import {
  createKeyMulti,
  encodeAddress,
  decodeAddress,
} from '@polkadot/util-crypto';
import * as fs from 'fs/promises';

import balances from "./balances.json"// assert {type: "json"};
import total_issuance from './issuance.json'// assert {type: "json"};
import crowdloan from './crowdloan.json'// assert {type: "json"};

import { convertAddresses, compute_total_contrib, connect, config } from "./setup.js";


// Convert a big number balance to expected float with correct units.
function toUnit(balance) {
    let base = new BN(10).pow(new BN(12));
    let dm = new BN(balance).divmod(base);
    return parseFloat(dm.div.toString() + "." + dm.mod.toString().padStart(12,'0'))
} 

async function checkBalances() {

  let converted_balances = convertAddresses(balances, "AccountId");
  let converted_crowdloan = crowdloan;//convertAddresses(crowdloan);

  try {
	const api = await connect();

	const keyring = new Keyring({ type: 'sr25519' });
	const sudo = keyring.addFromUri(config.keyring);

	const total_kab = total_issuance.issuance / 100;
	const kab_for_crowdloan = total_kab * (4.9 / 100)
	const total_crowdloan_contribution = compute_total_contrib();
	const kab_per_ksm = kab_for_crowdloan / total_crowdloan_contribution;
	//const treasuryAddress = u8aToHex(createKeyMulti(config.treasury_multisig_addresses, config.threshold));

	console.log("reading data...")
	if (converted_balances == undefined) {
	  throw ("No data");
	}
	// console.log("uploading balances...");
	// for (let account in converted_balances) {
	//   // account = converted_balances[account]
	//   const deposit = converted_crowdloan[account];
	//   if (deposit) {
	//     console.log(account);
	//     process.exit(0)
	//   }
	// }
	// process.exit(0)

	// let rawNonce = await api.rpc.system.accountNextIndex(sender);
	// let nonce = new BN(rawNonce.toString());
	//
	//
	let i = 0;
	for (let account in converted_balances) {
	  // console.log("comparing balance of " + account)
	  account = converted_balances[account]
	  let address = account.AccountId;

	  if (config.collators.includes(address) || address == config.sudo || address == config.edg_treasury ) {
		continue;
	  }
	  let new_balance = (account.Total / 100) * 10 ** 12;

	  const deposit = converted_crowdloan[address];
	  if (deposit != undefined) {
		delete converted_crowdloan[address]
		let add = deposit * kab_per_ksm * 10 ** 12
		new_balance += add
		// const percentage = deposit / (total_crowdloan_contribution / 100);
		// new_balance += kab_for_crowdloan * (percentage / 100);
	  }

	  const fetched_balance = await api.query.system.account(address)
	  // i get a BN, i have to convert it ! look at kusama crowdloan snapshot.
	  // console.log(fetched_balance.data.free)
	  // process.exit(0)
	  console.log(toUnit(fetched_balance.data.free))
	  // if fetchedBalance.Total > the existencial deposit
	
	  
	  //const expected = parseInt(new_balance)
	  //const got_free = parseInt(toUnit(fetched_balance.data.free))
	  const got_free = parseInt(toUnit(fetched_balance.data.free) * 10 ** 12)
	  const got_reserved = parseInt(toUnit(fetched_balance.data.reserved) * 10 ** 12)
	  const got = got_free + got_reserved

	  const expected_free = parseInt(((account.Free + account.Reserved) / 100) * 10 ** 12) * (3 / 10)
	  const expected_reserve = parseInt(((account.Free + account.Reserved) / 100) * 10 ** 12) * (7 / 10)

	  
	  if ((Math.abs(expected_free - got_free) > 1000) && (Math.abs(expected_reserve - got_reserved > 1000)) && (Math.abs(expected_free + expected_reserve) > 999999993)) {
		console.log()
		
		i += 1
		const err = "Mismatched balance on address " + address + " ->\n" + "total - got free " + got_free + " and reserved " + got_reserved + ", expected free " + expected_free + " and reserved " + expected_reserve + "\ndifference of " + (Math.abs(expected_free - got_free)) + ", and " + (Math.abs(expected_reserve - got_reserved)) // Math.round((Math.abs(got - expected) / (10 ** 12))
		
		console.log(err)
		console.log("trying a fix...")
		const free_balance = parseInt(expected_free)
		const reserved_balance = parseInt(expected_reserve)

		await api.tx.sudo.sudo(api.tx.balances.setBalance(address, free_balance.toString(), reserved_balance.toString())).signAndSend(sudo, { nonce: -1 })
		await api.tx.sudo.sudo(api.tx.relaySchedule.schedule(api.tx.balances.forceUnreserve(address, reserved_balance.toString()))).signAndSend(sudo, { nonce: -1 })
		await fs.appendFile('missmatch.json', err);
	  }

	  // if (fetched_balance.reserved != reserved_balance || fetched_balance.free != free_balance) {
	  //   console.log("missmatched balance on address " + address + " ->")
	  //   console.log("free - got " + fetched_balance.free + ", expected " + free_balance)
	  //   console.log("reserved - got " + fetched_balance.reserved + ", expected " + reserved_balance)
	  // }
	}
	console.log(i + " accounts with a difference")


	// console.log("creating remaining crowdloan accounts")
	// handle the rest of the crowdloan
	// let j = 0;
	// for (let address in converted_crowdloan) {
	//   j++;
	//   // address = "0x265a775a6d7ba9de83f9584dafe39e8329019c1e881b4c5097048fa72d392369"
	//   console.log("address " + address + " running crowdloan n° " + j );
	//   const deposit = converted_crowdloan[address];
	//
	//   let new_balance = (deposit / total_crowdloan_contribution * kab_for_crowdloan) * 10 ** 12
	//   const free_balance = parseInt(new_balance * (3 / 10))
	//   const reserved_balance = parseInt(new_balance * (7 / 10))
	//   await api.tx.sudo.sudo(api.tx.balances.setBalance(address, free_balance.toString(), reserved_balance.toString())).signAndSend(sudo, { nonce: -1 })
	//   await api.tx.sudo.sudo(api.tx.scheduler.scheduleAfter(350, null, 1, { Value: api.tx.balances.forceUnreserve(address, reserved_balance.toString()) })).signAndSend(sudo, { nonce: -1 })
	// break;
	// }

	// api.rpc.system.name

	process.exit(0)
  } catch (error) {
	console.log(error)
	process.exit(1)
  }
}

async function getTotalIssuance() {
  try {
	const api = await connect();

	console.log("querying the total issuance")
	let total_issuance = toUnit(await api.query.balances.totalIssuance(), 12)

	let data = {
	  issuance: total_issuance,
	}

	console.log("writing")
	await fs.writeFile('issuance.json', JSON.stringify(data));

	process.exit(0)
  } catch (e) {
	console.log(e);
	process.exit(1)
  }
}

// getTotalIssuance();
checkBalances();
