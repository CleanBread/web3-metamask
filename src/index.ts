import Web3 from 'web3';
import BigNumber from 'bignumber.js';

declare global {
  interface Window {
    ethereum: any;
  }
}

const networks = {
  mainnet: '0x1',
  ropsten: '0x3',
  kovan: '0x2a',
  rinkeby: '0x4',
};

interface IMetamaskService {
  testnet: 'ropsten' | 'kovan' | 'rinkeby';
  isProduction: boolean;
}

export default class MetamaskService {
  private wallet;
  private provider;
  private web3Provider;
  private testnet: string;
  private isProduction: boolean;
  public walletAddress: string = '';

  constructor({ testnet, isProduction = false }: IMetamaskService) {
    this.provider = Web3.givenProvider;
    this.wallet = window.ethereum;
    this.web3Provider = new Web3(this.provider);
    this.testnet = testnet;
    this.isProduction = isProduction;

    this.wallet.on('chainChanged', (newChain: any) => {
      const chainId = localStorage.getItem('chainId');
      if (String(chainId) !== String(newChain)) {
        localStorage.setItem('chainId', newChain);
        window.location.reload();
      }
    });
    this.wallet.on('accountsChanged', (newAccounts: any) => {
      window.location.reload();
    });
  }

  eth_requestAccounts() {
    return this.wallet.request({ method: 'eth_requestAccounts' });
  }

  getAccount() {
    const usedNetwork = this.isProduction ? 'mainnet' : this.testnet;
    const usedChain = this.isProduction
      ? networks.mainnet
      : networks[this.testnet];
    const currentChain = this.wallet.chainId;

    return new Promise((resolve, reject) => {
      if (!this.wallet) {
        reject({
          errorMsg: `${usedNetwork} wallet is not injected`,
        });
      }

      if (!currentChain || currentChain === null) {
        this.wallet
          .request({ method: 'eth_chainId' })
          .then((resChain) => {
            if (resChain === usedChain) {
              this.eth_requestAccounts()
                .then((account) => {
                  this.walletAddress = account[0];
                  resolve({
                    address: account[0],
                    network: resChain,
                  });
                })
                .catch((_) => reject({ errorMsg: 'Not authorized' }));
            } else {
              reject({
                errorMsg:
                  'Please choose ' +
                  usedNetwork +
                  ' network in metamask wallet',
              });
            }
          })
          .catch((_) => reject({ errorMsg: 'Not authorized' }));
      } else {
        if (currentChain === usedChain) {
          this.eth_requestAccounts()
            .then((account) => {
              this.walletAddress = account[0];
              resolve({
                address: account[0],
                network: currentChain,
              });
            })
            .catch((_) => reject({ errorMsg: 'Not authorized' }));
        } else {
          reject({
            errorMsg:
              'Please choose ' + usedNetwork + ' network in metamask wallet.',
          });
        }
      }
    });
  }

  getContract(tokenAddress: string, abi: Array<any>) {
    return new this.web3Provider.eth.Contract(abi, tokenAddress);
  }

  getMethodInterface(abi: Array<any>, methodName: string) {
    return abi.filter((m) => {
      return m.name === methodName;
    })[0];
  }
  encodeFunctionCall(abi: any, data: Array<any>) {
    return this.web3Provider.eth.abi.encodeFunctionCall(abi, data);
  }

  totalSupply = async (
    tokenAddress: string,
    abi: Array<any>,
    tokenDecimals: number,
  ) => {
    const contract = this.getContract(tokenAddress, abi);
    const totalSupply = await contract.methods.totalSupply().call();

    return +new BigNumber(totalSupply)
      .dividedBy(new BigNumber(10).pow(tokenDecimals))
      .toString(10);
  };

  checkTokenAllowance = (
    walletAddress: string,
    tokenAddress: string,
    amount: number,
    contract: any,
  ) => {
    return new Promise((resolve, reject) => {
      contract.methods
        .allowance(walletAddress, tokenAddress)
        .call()
        .then(
          (result: any) => {
            result = result ? result.toString(10) : result;
            result = result === '0' ? null : result;
            if (result && new BigNumber(result).minus(amount).isPositive()) {
              resolve(true);
            } else {
              reject(false);
            }
          },
          () => {
            reject(false);
          },
        );
    });
  };

  approveToken = async (
    tokenAddress: string,
    abi: Array<any>,
    tokenDecimals: number,
    walletAddress?: string,
  ) => {
    const totalSypply = await this.totalSupply(
      tokenAddress,
      abi,
      tokenDecimals,
    );

    const approveMethod = this.getMethodInterface(abi, 'approve');

    const approveSignature = this.encodeFunctionCall(approveMethod, [
      tokenAddress,
      totalSypply,
    ]);

    return this.sendTransaction({
      from: walletAddress || this.walletAddress,
      to: tokenAddress,
      data: approveSignature,
    });
  };

  sendTransaction(transactionConfig: any) {
    return this.wallet.request({
      method: 'eth_sendTransaction',
      params: [transactionConfig],
    });
  }
}
