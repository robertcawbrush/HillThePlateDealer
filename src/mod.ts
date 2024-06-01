import { DependencyContainer } from "tsyringe";

// SPT types
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

// New trader settings
import * as baseJson from "../db/base.json";
import { TraderHelper } from "./traderHelpers";
import { FluentAssortConstructor as FluentAssortCreator } from "./fluentTraderAssortCreator";
import { Money } from "@spt-aki/models/enums/Money";
import { Traders } from "@spt-aki/models/enums/Traders";
import { HashUtil } from "@spt-aki/utils/HashUtil";

const PARENT_ARMORPLATE_ID = '644120aa86ffbe10ee032b6f';

class HillThePlateDealer implements IPreAkiLoadMod, IPostDBLoadMod {
    private mod: string
    private logger: ILogger
    private traderHelper: TraderHelper
    private fluentAssortCreator: FluentAssortCreator

    constructor() {
        this.mod = "JackBrush-HillThePlateDealer";
    }

    /**
     * Some work needs to be done prior to SPT code being loaded, registering the profile image + setting trader update time inside the trader config json
     * @param container Dependency container
     */
    public preAkiLoad(container: DependencyContainer): void {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.debug(`[${this.mod}] preAki Loading... `);

        const preAkiModLoader: PreAkiModLoader = container.resolve<PreAkiModLoader>("PreAkiModLoader");
        const imageRouter: ImageRouter = container.resolve<ImageRouter>("ImageRouter");
        const hashUtil: HashUtil = container.resolve<HashUtil>("HashUtil");
        const configServer = container.resolve<ConfigServer>("ConfigServer");
        const traderConfig: ITraderConfig = configServer.getConfig<ITraderConfig>(ConfigTypes.TRADER);
        const ragfairConfig = configServer.getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR);

        this.traderHelper = new TraderHelper();
        this.fluentAssortCreator = new FluentAssortCreator(hashUtil, this.logger);
        this.traderHelper.registerProfileImage(baseJson, this.mod, preAkiModLoader, imageRouter, "hill.jpg");
        this.traderHelper.setTraderUpdateTime(traderConfig, baseJson, 3600, 4000);

        Traders[baseJson._id] = baseJson._id;

        ragfairConfig.traders[baseJson._id] = true;

        this.logger.debug(`[${this.mod}] preAki Loaded`);
    }

    /**
     * Majority of trader-related work occurs after the aki database has been loaded but prior to SPT code being run
     * @param container Dependency container
     */
    public postDBLoad(container: DependencyContainer): void {
        this.logger.debug(`[${this.mod}] postDb Loading... `);

        // Resolve SPT classes we'll use
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const configServer: ConfigServer = container.resolve<ConfigServer>("ConfigServer");
        const jsonUtil: JsonUtil = container.resolve<JsonUtil>("JsonUtil");

        // Get a reference to the database tables
        const tables = databaseServer.getTables();

        // TODO: begin
        // Assuming you have the traders object and the armor plate ID

        // Assuming you have access to the tables object

        const existingItemPrices = {}
        let lowestRealPrice = Infinity;
        // Iterate over each trader
        for (const traderId of Object.values(Traders)) {
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
                                lowestRealPrice = price
                            }
                            if (price) {
                                existingItemPrices[item._tpl] = price;
                            }
                        }
                    }
                }
            }
            else {
                this.logger.info(`trader ${traderId} did not have any items in the database`)
            }
        }

        // TODO: end

        this.traderHelper.addTraderToDb(baseJson, tables, jsonUtil);

        const items = tables?.templates?.items;
        const plateIds = []
        for (const [id, item] of Object.entries(items)) {
            const parentId = item._parent;

            const isArmorPlate = parentId === PARENT_ARMORPLATE_ID
            const isNonExistentInPVE = item._props.RarityPvE === "Not_exist";

            if (item._type !== 'Item') {
                continue;
            }

            if (!isArmorPlate && !isNonExistentInPVE) {
                continue;
            }

            plateIds.push(id)
        }

        plateIds.map((id) => {
            try {
                // get price from existing price arr

                const existingPrice = existingItemPrices[id];
                const itemPriceTooLow = existingPrice < lowestRealPrice
                const price = itemPriceTooLow ? lowestRealPrice : existingPrice;
                this.logger.info(`lowest real price is ${lowestRealPrice}`)

                this.fluentAssortCreator.createSingleAssortItem(id)
                    .addStackCount(5)
                    .addBuyRestriction(10)
                    .addMoneyCost(Money.ROUBLES, price || 10000)
                    .addLoyaltyLevel(1)
                    .export(tables.traders[baseJson._id]);
            }
            catch {
                this.logger.error(`[${this.mod}] - an error occurred adding item of id ${id} to the database`)
            }
        })

        this.traderHelper.addTraderToLocales(
            baseJson,
            tables,
            baseJson.name,
            "Hill",
            baseJson.nickname,
            baseJson.location,
            "I sell plates and plate accessories",
        );

        this.logger.debug(`[${this.mod}] postDb Loaded`);
    }
}

module.exports = {mod: new HillThePlateDealer()}