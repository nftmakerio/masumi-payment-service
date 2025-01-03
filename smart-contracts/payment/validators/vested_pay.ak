use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite, Interval, IntervalBound, PositiveInfinity}
use aiken/primitive/bytearray
use cardano/transaction.{
  InlineDatum, Input, OutputReference, Transaction, ValidityRange, find_input,
}
use cardano/assets.{Value}

//use cardano/assets.{PolicyId}
//use aiken/collection/dict
//use aiken/builtin.{blake2b_256}

type POSIXTime =
  Int

//this will be provided by the buyer and accepted by the seller off-chain
pub type Datum {
  buyer: VerificationKeyHash,
  seller: VerificationKeyHash,
  referenceId: ByteArray,
  resultHash: ByteArray,
  unlock_time: POSIXTime,
  refund_time: POSIXTime,
  refund_requested: Bool,
  refund_denied: Bool,
}

pub type Action {
  //this will only work after the unlock time
  Withdraw
  //this will set the refund_requested to True and auto approved after the refund time, can only be called before the unlock time
  RequestRefund
  //this will cancel any refund request and unlock the funds (immediately if the unlock time is over)
  CancelRefundRequest
  //is implicitly allowed if the refund was requested and the refund time is over (and not denied)
  WithdrawRefund
  //this will set the refund_denied to True and prevent any withdrawal
  DenyRefund
  //multi sig 2/3
  WithdrawDisputed
  //multi sig 2/3
  WithdrawFee
}

validator vested_pay(admin_vks: List<VerificationKeyHash>, fee_permille: Int) {
  spend(
    datum: Option<Datum>,
    redeemer: Action,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(Datum {
      buyer,
      seller,
      referenceId,
      resultHash,
      unlock_time,
      refund_time,
      refund_requested,
      refund_denied,
    }) = datum
    let Transaction { validity_range, .. } = self

            expect Some(input) =
          self.inputs
            |> find_input(own_ref)

        let count_script_address = input.output.address

        let inputs = self.inputs |> list.filter(fn(input) { input.output.address == count_script_address })
        //ensure there is only one input utxo from our script, to prevent double spending
        expect list.length(inputs) == 1

    when redeemer is {
      // Seller can withdraw after unlock_time if no refund was requested
      Withdraw -> {




        expect Some(output) =
          self.outputs
            |> list.filter(fn(output) { output.address == count_script_address })
            |> list.head()
        expect InlineDatum(maybe_new_datum) = output.datum
        expect new_datum: Datum = maybe_new_datum

        expect must_be_signed_by(self, seller)

        expect refund_requested == False
        expect refund_denied == False

        expect must_start_after(validity_range, unlock_time)

        //we allow immediate withdraw if the result hash was set by dispute and a canceled refund request
        //or {
        //  expect must_start_after(validity_range, unlock_time)
        //  expect bytearray.is_empty(resultHash) == False
        //}
        expect bytearray.is_empty(new_datum.resultHash) == False
        //TODO: add minimum network fee check either in coins or ada
        expect fee_value_is_preserved(input.output.value, output.value, fee_permille)


        and {
          new_datum.buyer == buyer,
          new_datum.seller == seller,
          new_datum.referenceId == referenceId,
          new_datum.unlock_time == unlock_time,
          new_datum.refund_time == refund_time,
          new_datum.refund_requested == False,
          new_datum.refund_denied == False,
        }
      }

      RequestRefund -> {
        

        expect Some(output) =
          self.outputs
            |> list.filter(fn(output) { output.address == count_script_address })
            |> list.head()
        expect InlineDatum(maybe_new_datum) = output.datum
        expect new_datum: Datum = maybe_new_datum
        expect must_be_signed_by(self, buyer)
        expect output_value_is_preserved(input.output.value, output.value)

        expect refund_requested == False
        //refund is not denied is implicitly only set if refund was requested before, but we do a sanity check
        expect refund_denied == False

        expect must_end_before(validity_range, unlock_time)
        expect bytearray.is_empty(new_datum.resultHash) == True

        and {
          new_datum.buyer == buyer,
          new_datum.seller == seller,
          new_datum.referenceId == referenceId,
          new_datum.resultHash == resultHash,
          new_datum.unlock_time == unlock_time,
          new_datum.refund_time == refund_time,
          new_datum.refund_requested == True,
          new_datum.refund_denied == False,
        }
      }
      // Seller can approve the refund request
      WithdrawRefund -> {
        expect must_be_signed_by(self, buyer)
        and {
          must_start_after(validity_range, refund_time),
          refund_requested == True,
          refund_denied == False,
        }
      }
      DenyRefund -> {
        
        expect Some(output) =
          self.outputs
            |> list.filter(fn(output) { output.address == count_script_address })
            |> list.head()
        expect InlineDatum(maybe_new_datum) = output.datum
        expect new_datum: Datum = maybe_new_datum

        expect must_be_signed_by(self, seller)

        //expect the locked value to be preserved
        expect output_value_is_preserved(input.output.value, output.value)

        expect refund_requested == True
        expect refund_denied == False

        //force output resultHash to be set
        expect bytearray.is_empty(new_datum.resultHash) == False

        and {
          new_datum.buyer == buyer,
          new_datum.seller == seller,
          new_datum.referenceId == referenceId,
          new_datum.unlock_time == unlock_time,
          new_datum.refund_time == refund_time,
          new_datum.refund_requested == True,
          new_datum.refund_denied == True,
        }
      }
      //The buyer can cancel the refund request, if the vesting period is over, this will immediately give the seller the option to withdraw any funds
      CancelRefundRequest -> {
        

        expect Some(output) =
          self.outputs
            |> list.filter(fn(output) { output.address == count_script_address })
            |> list.head()
        expect InlineDatum(maybe_new_datum) = output.datum
        expect new_datum: Datum = maybe_new_datum
        expect must_be_signed_by(self, buyer)

        //expect the locked value to be preserved
        expect output_value_is_preserved(input.output.value, output.value)

        //we always allow to cancel the refund request otherwise we would want to ensure
        expect refund_requested == True
        expect refund_denied == False
        //the buyer will not be able to request an other refund as the hash would be set
        and {
          new_datum.buyer == buyer,
          new_datum.seller == seller,
          new_datum.referenceId == referenceId,
          new_datum.resultHash == resultHash,
          new_datum.unlock_time == unlock_time,
          new_datum.refund_time == refund_time,
          new_datum.refund_requested == False,
          new_datum.refund_denied == False,
        }
      }
      //multi sig 2/3 to withdraw the disputed funds via network admins
      WithdrawDisputed -> {
        expect refund_requested == True
        expect refund_denied == True
        expect bytearray.is_empty(resultHash) == False
        let countOfAdmins = list.length(admin_vks)
        expect countOfAdmins == 3
        let signedBy =
          list.filter(admin_vks, fn(vk) { must_be_signed_by(self, vk) })
        list.length(signedBy) >= 2
      }
      //multi sig 2/3 to withdraw the fee for the network (admins)
      WithdrawFee -> {
        expect refund_requested == False
        expect refund_denied == False
        expect bytearray.is_empty(resultHash) == False
        let countOfAdmins = list.length(admin_vks)
        expect countOfAdmins == 3
        let signedBy =
          list.filter(admin_vks, fn(vk) { must_be_signed_by(self, vk) })
        list.length(signedBy) >= 2
      }
    }
  }

  else(_) {
    fail
  }
}

fn output_value_is_preserved(input_value: Value, output_value: Value) {
    assets.flatten(input_value)|>list.all(fn(asset) { 
    let out_value = assets.quantity_of(output_value, asset.1st, asset.2nd)
    out_value >= asset.3rd
  })
}

test output_value_is_preserved_succeeds() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 51)
    |> assets.add("foo2", "bar", 32)
    |> assets.add("foo2", "baz", 1)
  let output_value: Value =
    assets.from_lovelace(100)
      |> assets.add("foo", "bar", 51)
      |> assets.add("foo2", "bar", 33)
      |> assets.add("foo2", "baz", 1)
  output_value_is_preserved(input_value, output_value)
}

test output_value_is_preserved_fails_1() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 42)

  let output_value: Value =
    assets.from_lovelace(100)
      |> assets.add("foo", "bar", 4)
      |> assets.add("foo2", "bar", 42)
      |> assets.add("foo", "baz", 100)
  output_value_is_preserved(input_value, output_value) == False
}
test output_value_is_preserved_fails_2() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 42)

  let output_value: Value =
    assets.from_lovelace(100)
      |> assets.add("foo2", "bar", 42)
      |> assets.add("foo", "baz", 100)
  output_value_is_preserved(input_value, output_value) == False
}
test output_value_is_preserved_fails_3() {
  let input_value: Value =
  assets.from_lovelace(105)

  let output_value: Value =
    assets.from_lovelace(100)
  output_value_is_preserved(input_value, output_value) == False
}
test output_value_is_preserved_fails_4() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 42)

  let output_value: Value =
    assets.from_lovelace(98)
      |> assets.add("foo", "bar", 42)
      |> assets.add("foo", "baz", 100)
  output_value_is_preserved(input_value, output_value) == False
}

fn fee_value_is_preserved(input_value: Value, output_value: Value, fee_permille: Int) {
  //ignore if the output contains more assets than the input 
  assets.flatten(input_value)|>list.all(fn(asset) { 
    let fee_amount = (asset.3rd * fee_permille) / 1000 //cutoff to round down
    let out_value = assets.quantity_of(output_value, asset.1st, asset.2nd)
    out_value >= fee_amount
  })
}

test fee_value_is_preserved_succeeds() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 42)
    |> assets.add("foo2", "bar", 32)
    //correctly round down and ignore 0
    |> assets.add("foo2", "baz", 1)
  let output_value: Value =
    //check for correct equal behavior
  assets.from_lovelace(10)
    //check for correct rounding behavior
      |> assets.add("foo", "bar", 4)
      //ignore additional assets
      |> assets.add("foo", "baz", 4)
      //allow bigger output value
      |> assets.add("foo2", "bar", 4)
  fee_value_is_preserved(
    input_value,
    output_value,
    100,
  )
}
test fee_value_is_preserved_fails_1() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 50)
   

  let output_value: Value =
    //check for correct equal behavior
  assets.from_lovelace(10)
    //check for failing down
      |> assets.add("foo", "bar", 4)
       |> assets.add("foo", "baz", 5)
        |> assets.add("foo1", "bar", 5)

  fee_value_is_preserved(
    input_value,
    output_value,
    100,
  )==False
}
test fee_value_is_preserved_fails_4() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 50)
   

  let output_value: Value =
    //check for correct equal behavior
  assets.from_lovelace(10)
    //check for failing not included
       |> assets.add("foo", "baz", 5)

  fee_value_is_preserved(
    input_value,
    output_value,
    100,
  )==False
}
test fee_value_is_preserved_fails_2() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 50)

  let output_value: Value =
    //check for correct equal behavior
  assets.from_lovelace(10)
    //check for failing down
      |> assets.add("foo", "bar", 4)

  fee_value_is_preserved(
    input_value,
    output_value,
    100,
  )==False
}
test fee_value_is_preserved_fails_3() {
  let input_value: Value =
  assets.from_lovelace(100)
    |> assets.add("foo", "bar", 50)

  let output_value: Value =
    //check for correct equal behavior
  assets.from_lovelace(9)
    //check for failing down
      |> assets.add("foo", "bar", 60)

  fee_value_is_preserved(
    input_value,
    output_value,
    100,
  )==False
}

fn must_be_signed_by(transaction: Transaction, vk: VerificationKeyHash) {
  list.has(transaction.extra_signatories, vk)
}

fn must_start_after(range: ValidityRange, lock_expiration_time: POSIXTime) {
  when range.lower_bound.bound_type is {
    Finite(tx_earliest_time) -> lock_expiration_time <= tx_earliest_time
    _ -> False
  }
}

fn must_end_before(range: ValidityRange, lock_expiration_time: POSIXTime) {
  when range.upper_bound.bound_type is {
    Finite(tx_earliest_time) -> lock_expiration_time >= tx_earliest_time
    _ -> False
  }
}

test must_start_after_succeed_when_lower_bound_is_after() {
  must_start_after(interval.after(2), 1)
}

test must_start_after_succeed_when_lower_bound_is_equal() {
  must_start_after(interval.after(2), 2)
}

test must_start_after_fail_when_lower_bound_is_before() {
  must_start_after(interval.after(2), 3) == False
}

test must_start_after_fail_if_infinite() {
  must_start_after(
    Interval {
      lower_bound: IntervalBound {
        bound_type: PositiveInfinity,
        is_inclusive: True,
      },
      upper_bound: IntervalBound {
        bound_type: PositiveInfinity,
        is_inclusive: True,
      },
    },
    3,
  ) == False
}

test must_start_after_success_if_custom_lower_bound() {
  must_start_after(
    Interval {
      lower_bound: IntervalBound { bound_type: Finite(10), is_inclusive: True },
      upper_bound: IntervalBound {
        bound_type: PositiveInfinity,
        is_inclusive: True,
      },
    },
    8,
  )
}
