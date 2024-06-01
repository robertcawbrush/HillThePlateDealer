"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ConfigTypes_1 = require("C:/snapshot/project/obj/models/enums/ConfigTypes");
// New trader settings
const baseJson = __importStar(require("../db/base.json"));
const traderHelpers_1 = require("./traderHelpers");
const fluentTraderAssortCreator_1 = require("./fluentTraderAssortCreator");
const Money_1 = require("C:/snapshot/project/obj/models/enums/Money");
const Traders_1 = require("C:/snapshot/project/obj/models/enums/Traders");
const PARENT_ARMORPLATE_ID = '644120aa86ffbe10ee032b6f';
class HillThePlateDealer {
    mod;
    logger;
    traderHelper;
    fluentAssortCreator;
    constructor() {
        this.mod = "JackBrush-HillThePlateDealer";
    }
    /**
     * Some work needs to be done prior to SPT code being loaded, registering the profile image + setting trader update time inside the trader config json
     * @param container Dependency container
     */
    preAkiLoad(container) {
        this.logger = container.resolve("WinstonLogger");
        this.logger.debug(`[${this.mod}] preAki Loading... `);
        const preAkiModLoader = container.resolve("PreAkiModLoader");
        const imageRouter = container.resolve("ImageRouter");
        const hashUtil = container.resolve("HashUtil");
        const configServer = container.resolve("ConfigServer");
        const traderConfig = configServer.getConfig(ConfigTypes_1.ConfigTypes.TRADER);
        const ragfairConfig = configServer.getConfig(ConfigTypes_1.ConfigTypes.RAGFAIR);
        this.traderHelper = new traderHelpers_1.TraderHelper();
        this.fluentAssortCreator = new fluentTraderAssortCreator_1.FluentAssortConstructor(hashUtil, this.logger);
        this.traderHelper.registerProfileImage(baseJson, this.mod, preAkiModLoader, imageRouter, "hill.jpg");
        this.traderHelper.setTraderUpdateTime(traderConfig, baseJson, 3600, 4000);
        Traders_1.Traders[baseJson._id] = baseJson._id;
        ragfairConfig.traders[baseJson._id] = true;
        this.logger.debug(`[${this.mod}] preAki Loaded`);
    }
    /**
     * Majority of trader-related work occurs after the aki database has been loaded but prior to SPT code being run
     * @param container Dependency container
     */
    postDBLoad(container) {
        this.logger.debug(`[${this.mod}] postDb Loading... `);
        // Resolve SPT classes we'll use
        const databaseServer = container.resolve("DatabaseServer");
        const configServer = container.resolve("ConfigServer");
        const jsonUtil = container.resolve("JsonUtil");
        // Get a reference to the database tables
        const tables = databaseServer.getTables();
        // TODO: begin
        // Assuming you have the traders object and the armor plate ID
        // Assuming you have access to the tables object
        const existingItemPrices = {};
        let lowestRealPrice = Infinity;
        // Iterate over each trader
        for (const traderId of Object.values(Traders_1.Traders)) {
            // check for self then skip
            if (traderId === baseJson._id) {
                continue;
            }
            const trader = tables.traders[traderId];
            // Check if the trader exists
            if (!trader) {
                this.logger.info(`Trader with ID ${traderId} does not exist.`);
                continue;
            }
            const traderItems = trader?.assort?.items;
            if (traderItems) {
                for (const item of traderItems) {
                    const curItem = trader.assort.barter_scheme[item._id];
                    if (curItem) {
                        const curItemFirstArr = curItem[0];
                        if (curItemFirstArr) {
                            const curItemSecondArr = curItemFirstArr[0];
                            const price = curItemSecondArr?.count;
                            if (price > 8000 && price < lowestRealPrice) {
                                lowestRealPrice = price;
                            }
                            if (price) {
                                existingItemPrices[item._tpl] = price;
                            }
                        }
                    }
                }
            }
            else {
                this.logger.info(`trader ${traderId} did not have any items in the database`);
            }
        }
        // TODO: end
        this.traderHelper.addTraderToDb(baseJson, tables, jsonUtil);
        const items = tables?.templates?.items;
        const plateIds = [];
        for (const [id, item] of Object.entries(items)) {
            const parentId = item._parent;
            const isArmorPlate = parentId === PARENT_ARMORPLATE_ID;
            const isNonExistentInPVE = item._props.RarityPvE === "Not_exist";
            if (item._type !== 'Item') {
                continue;
            }
            if (!isArmorPlate && !isNonExistentInPVE) {
                continue;
            }
            plateIds.push(id);
        }
        plateIds.map((id) => {
            try {
                // get price from existing price arr
                const existingPrice = existingItemPrices[id];
                const itemPriceTooLow = existingPrice < lowestRealPrice;
                const price = itemPriceTooLow ? lowestRealPrice : existingPrice;
                this.logger.info(`lowest real price is ${lowestRealPrice}`);
                this.fluentAssortCreator.createSingleAssortItem(id)
                    .addStackCount(5)
                    .addBuyRestriction(10)
                    .addMoneyCost(Money_1.Money.ROUBLES, price || 10000)
                    .addLoyaltyLevel(1)
                    .export(tables.traders[baseJson._id]);
            }
            catch {
                this.logger.error(`[${this.mod}] - an error occurred adding item of id ${id} to the database`);
            }
        });
        this.traderHelper.addTraderToLocales(baseJson, tables, baseJson.name, "Hill", baseJson.nickname, baseJson.location, "I sell plates and plate accessories");
        this.logger.debug(`[${this.mod}] postDb Loaded`);
    }
}
module.exports = { mod: new HillThePlateDealer() };
//# sourceMappingURL=mod.js.map