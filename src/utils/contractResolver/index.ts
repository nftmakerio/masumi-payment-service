import { PlutusScript } from "@meshsdk/core";
import { deserializePlutusScript, resolvePlutusScriptAddress, resolveStakeKeyHash } from "@meshsdk/core-cst";
import { resolvePaymentKeyHash } from "@meshsdk/core-cst";
import paymentPlutus from "@/../smart-contracts/payment/plutus.json"
import registryPlutus from "@/../smart-contracts/registry/plutus.json"
import { Network, NetworkHandler } from "@prisma/client";
import { applyParamsToScript } from "@meshsdk/core";

export async function getPaymentScriptFromNetworkHandlerV1(networkCheckSupported: NetworkHandler & { AdminWallets: { walletAddress: string, order: number }[], FeeReceiverNetworkWallet: { walletAddress: string, order: number } }) {
    const adminWallets = networkCheckSupported.AdminWallets;
    if (adminWallets.length != 3)
        throw new Error("Invalid admin wallets")

    const sortedAdminWallets = adminWallets.sort((a, b) => a.order - b.order)
    const admin1 = sortedAdminWallets[0];
    const admin2 = sortedAdminWallets[1];
    const admin3 = sortedAdminWallets[2];
    const feeWallet = networkCheckSupported.FeeReceiverNetworkWallet
    return await getPaymentScriptV1(admin1.walletAddress, admin2.walletAddress, admin3.walletAddress, feeWallet.walletAddress, networkCheckSupported.FeePermille, networkCheckSupported.network)
}

export async function getRegistryScriptFromNetworkHandlerV1(networkCheckSupported: NetworkHandler) {
    return await getRegistryScriptV1(networkCheckSupported.addressToCheck, networkCheckSupported.network)
}

export async function getPaymentScriptV1(adminWalletAddress1: string, adminWalletAddress2: string, adminWalletAddress3: string, feeWalletAddress: string, feePermille: number, network: Network) {

    if (feePermille < 0 || feePermille > 1000)
        throw new Error("Fee permille must be between 0 and 1000")

    const script: PlutusScript = {
        code: applyParamsToScript(paymentPlutus.validators[0].compiledCode, [
            [
                resolvePaymentKeyHash(adminWalletAddress1),
                resolvePaymentKeyHash(adminWalletAddress2),
                resolvePaymentKeyHash(adminWalletAddress3),
            ],
            //yes I love meshJs
            {
                alternative: 0,
                fields: [
                    {
                        alternative: 0,
                        fields: [resolvePaymentKeyHash(feeWalletAddress)],
                    },
                    {
                        alternative: 0,
                        fields: [
                            {
                                alternative: 0,
                                fields: [
                                    {
                                        alternative: 0,
                                        fields: [resolveStakeKeyHash(feeWalletAddress)],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            feePermille,
        ]),
        version: "V3"
    };
    const smartContractAddress = resolvePlutusScriptAddress(script, network == "MAINNET" ? 1 : 0)
    return { script, smartContractAddress }
}

export async function getRegistryScriptV1(contractAddress: string, network: Network) {

    const script: PlutusScript = {
        code: applyParamsToScript(registryPlutus.validators[0].compiledCode, [
            contractAddress,
        ]),
        version: "V3",
    };

    const policyId = deserializePlutusScript(script.code, script.version as "V1" | "V2" | "V3")
        .hash()
        .toString();

    const smartContractAddress = resolvePlutusScriptAddress(script, network == "MAINNET" ? 1 : 0)
    return { script, policyId, smartContractAddress }
}