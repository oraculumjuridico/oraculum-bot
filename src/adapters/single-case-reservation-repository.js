"use strict"
const fail=code=>{throw new Error(code)}
function createSingleCaseReservationRepository({pool}={}){if(!pool||typeof pool.query!=="function")fail("RESERVATION_POOL_MISSING");return Object.freeze({async findByKey(key){if(typeof key!=="string"||!key.startsWith("case-import:"))fail("RESERVATION_KEY_INVALID");let result;try{result=await pool.query("SELECT reservation_key,case_number,status FROM case_number_reservations WHERE reservation_key=$1 ORDER BY reservation_key LIMIT 2",[key])}catch{fail("RESERVATION_QUERY_FAILED")};if(!result||!Array.isArray(result.rows))fail("RESERVATION_RESPONSE_INVALID");if(result.rows.length>1)fail("RESERVATION_AMBIGUOUS");return result.rows[0]||null}})}
module.exports={createSingleCaseReservationRepository}
