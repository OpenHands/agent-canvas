import {
  ComboBox,
  Header,
  Input,
  ListBox,
  Separator,
  Spinner,
  type Key,
} from "@heroui/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { extractModelAndProvider } from "#/utils/extract-model-and-provider";
import { mapProvider } from "#/utils/map-provider";
import { cn } from "#/utils/utils";
import { PRODUCT_URL } from "#/utils/constants";
import { useProviderModels } from "#/hooks/query/use-provider-models";
import { useSearchProviders } from "#/hooks/query/use-search-providers";
import { HelpLink } from "#/ui/help-link";

interface ModelSelectorProps {
  isDisabled?: boolean;
  currentModel?: string;
  onChange?: (provider: string | null, model: string | null) => void;
  onDefaultValuesChanged?: (
    provider: string | null,
    model: string | null,
  ) => void;
  wrapperClassName?: string;
  labelClassName?: string;
}

interface ComboBoxSectionItem {
  key: string;
  label: string;
  section: "verified" | "others";
  testId?: string;
}

const INPUT_GROUP_CLASS =
  "bg-tertiary border border-[#717888] h-10 w-full rounded-sm px-2 flex items-center gap-2";
const POPOVER_CLASS =
  "bg-tertiary rounded-xl border border-[#717888] overflow-hidden";
const LIST_BOX_ITEM_CLASS =
  "px-3 py-2 text-sm text-content hover:bg-white/5 cursor-pointer rounded-md mx-1";
const TRIGGER_CLASS = "text-tertiary-light/80 hover:text-content transition-colors";
const SECTION_HEADER_CLASS = "px-3 pt-2 pb-1 text-xs uppercase text-tertiary-light";
const SECTION_SEPARATOR_CLASS = "my-1 h-px bg-[#717888]/50";

function SectionedComboBox({
  ariaLabel,
  testId,
  items,
  placeholder,
  selectedKey,
  inputValue,
  isDisabled,
  isRequired,
  isLoading,
  verifiedLabel,
  othersLabel,
  onSelectionChange,
  onInputChange,
}: {
  ariaLabel: string;
  testId: string;
  items: ComboBoxSectionItem[];
  placeholder: string;
  selectedKey: string | null;
  inputValue: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isLoading?: boolean;
  verifiedLabel: string;
  othersLabel: string;
  onSelectionChange: (key: Key | null) => void;
  onInputChange?: (value: string) => void;
}) {
  const verifiedItems = React.useMemo(
    () => items.filter((item) => item.section === "verified"),
    [items],
  );
  const otherItems = React.useMemo(
    () => items.filter((item) => item.section === "others"),
    [items],
  );

  return (
    <ComboBox
      aria-label={ariaLabel}
      className="w-full"
      inputValue={inputValue}
      isDisabled={isDisabled}
      isRequired={isRequired}
      items={items}
      name={testId}
      onInputChange={onInputChange}
      onSelectionChange={onSelectionChange}
      selectedKey={selectedKey}
    >
      <ComboBox.InputGroup className={INPUT_GROUP_CLASS}>
        <Input
          aria-label={ariaLabel}
          className="flex-1 bg-transparent text-sm text-content placeholder:italic outline-none"
          data-testid={testId}
          placeholder={placeholder}
        />
        {isLoading ? <Spinner size="sm" /> : null}
        <ComboBox.Trigger className={TRIGGER_CLASS} />
      </ComboBox.InputGroup>
      <ComboBox.Popover className={POPOVER_CLASS}>
        <ListBox className="max-h-60 overflow-auto py-1">
          <ListBox.Section>
            <Header className={SECTION_HEADER_CLASS}>{verifiedLabel}</Header>
            {verifiedItems.map((item) => (
              <ListBox.Item
                className={LIST_BOX_ITEM_CLASS}
                data-testid={item.testId}
                id={item.key}
                key={item.key}
                textValue={item.label}
              >
                {item.label}
              </ListBox.Item>
            ))}
          </ListBox.Section>
          {otherItems.length > 0 ? (
            <>
              <Separator className={SECTION_SEPARATOR_CLASS} />
              <ListBox.Section>
                <Header className={SECTION_HEADER_CLASS}>{othersLabel}</Header>
                {otherItems.map((item) => (
                  <ListBox.Item
                    className={LIST_BOX_ITEM_CLASS}
                    data-testid={item.testId}
                    id={item.key}
                    key={item.key}
                    textValue={item.label}
                  >
                    {item.label}
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            </>
          ) : null}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

export function ModelSelector({
  isDisabled,
  currentModel,
  onChange,
  onDefaultValuesChanged,
  wrapperClassName,
  labelClassName,
}: ModelSelectorProps) {
  const [, setLitellmId] = React.useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = React.useState<string | null>(
    null,
  );
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [pendingCurrentModel, setPendingCurrentModel] = React.useState<{
    provider: string | null;
    model: string | null;
  } | null>(null);
  const [providerInputValue, setProviderInputValue] = React.useState("");
  const [modelInputValue, setModelInputValue] = React.useState("");

  const { data: providers = [] } = useSearchProviders();
  const {
    data: providerModels = [],
    isLoading: isLoadingModels,
    error: modelsError,
  } = useProviderModels(selectedProvider);

  const verifiedProviders = React.useMemo(
    () => providers.filter((provider) => provider.verified),
    [providers],
  );
  const unverifiedProviders = React.useMemo(
    () => providers.filter((provider) => !provider.verified),
    [providers],
  );

  const verifiedModels = React.useMemo(
    () => providerModels.filter((model) => model.verified),
    [providerModels],
  );
  const unverifiedModels = React.useMemo(
    () => providerModels.filter((model) => !model.verified),
    [providerModels],
  );

  const providerItems = React.useMemo<ComboBoxSectionItem[]>(
    () => [
      ...verifiedProviders.map((provider) => ({
        key: provider.name,
        label: mapProvider(provider.name),
        section: "verified" as const,
        testId: `provider-item-${provider.name}`,
      })),
      ...unverifiedProviders.map((provider) => ({
        key: provider.name,
        label: mapProvider(provider.name),
        section: "others" as const,
      })),
    ],
    [unverifiedProviders, verifiedProviders],
  );

  const modelItems = React.useMemo<ComboBoxSectionItem[]>(
    () => [
      ...verifiedModels.map((model) => ({
        key: model.name,
        label: model.name,
        section: "verified" as const,
      })),
      ...unverifiedModels.map((model) => ({
        key: model.name,
        label: model.name,
        section: "others" as const,
        testId: `model-item-${model.name}`,
      })),
    ],
    [unverifiedModels, verifiedModels],
  );

  React.useEffect(() => {
    if (!currentModel) {
      return;
    }

    const { provider, model } = extractModelAndProvider(currentModel);

    setLitellmId(currentModel);
    setPendingCurrentModel({ provider: provider || null, model });
    setSelectedProvider(provider || null);
    setSelectedModel(null);
    setProviderInputValue(provider ? mapProvider(provider) : "");
    setModelInputValue(model ?? "");
    onDefaultValuesChanged?.(provider || null, model);
  }, [currentModel, onDefaultValuesChanged]);

  React.useEffect(() => {
    if (!selectedProvider) {
      setModelInputValue("");
      setSelectedModel(null);
      return;
    }

    const nextProviderLabel = mapProvider(selectedProvider);
    if (providerInputValue !== nextProviderLabel) {
      setProviderInputValue(nextProviderLabel);
    }
  }, [providerInputValue, selectedProvider]);

  React.useEffect(() => {
    if (!pendingCurrentModel?.model) {
      return;
    }

    if (pendingCurrentModel.provider !== selectedProvider) {
      return;
    }

    const matchingModel = providerModels.find(
      (model) => model.name === pendingCurrentModel.model,
    );

    if (!matchingModel) {
      return;
    }

    setSelectedModel(matchingModel.name);
    setModelInputValue(matchingModel.name);
    setPendingCurrentModel(null);
  }, [pendingCurrentModel, providerModels, selectedProvider]);

  React.useEffect(() => {
    if (!selectedModel) {
      return;
    }

    setModelInputValue(selectedModel);
  }, [modelItems.length, selectedModel]);

  const handleChangeProvider = (provider: string) => {
    setSelectedProvider(provider);
    setSelectedModel(null);
    setModelInputValue("");
    setProviderInputValue(mapProvider(provider));
    setLitellmId(`${provider}/`);
    onChange?.(provider, null);
  };

  const handleChangeModel = (model: string) => {
    let fullModel = `${selectedProvider}/${model}`;

    if (selectedProvider === "openai") {
      fullModel = model;
    }

    setLitellmId(fullModel);
    setSelectedModel(model);
    setModelInputValue(model);
    onChange?.(selectedProvider, model);
  };

  const clear = () => {
    setSelectedProvider(null);
    setSelectedModel(null);
    setProviderInputValue("");
    setModelInputValue("");
    setLitellmId(null);
  };

  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex flex-col md:flex-row w-full max-w-[680px] justify-between gap-4 md:gap-[46px]",
        wrapperClassName,
      )}
    >
      <fieldset className="flex flex-col gap-2.5 w-full">
        <label className={cn("text-sm", labelClassName)}>
          {t(I18nKey.LLM$PROVIDER)}
        </label>
        <SectionedComboBox
          ariaLabel={t(I18nKey.LLM$PROVIDER)}
          inputValue={providerInputValue}
          isDisabled={isDisabled}
          isRequired
          items={providerItems}
          onInputChange={(value) => {
            setProviderInputValue(value);
            if (!value) {
              clear();
            }
          }}
          onSelectionChange={(key) => {
            if (key?.toString()) {
              handleChangeProvider(key.toString());
            }
          }}
          othersLabel={t(I18nKey.MODEL_SELECTOR$OTHERS)}
          placeholder={t(I18nKey.LLM$SELECT_PROVIDER_PLACEHOLDER)}
          selectedKey={selectedProvider}
          testId="llm-provider-input"
          verifiedLabel={t(I18nKey.MODEL_SELECTOR$VERIFIED)}
        />
      </fieldset>

      {selectedProvider === "openhands" && (
        <HelpLink
          testId="openhands-account-help"
          text={t(I18nKey.SETTINGS$NEED_OPENHANDS_ACCOUNT)}
          linkText={t(I18nKey.SETTINGS$CLICK_HERE)}
          href={PRODUCT_URL.PRODUCTION}
          linkColor="white"
          size="settings"
        />
      )}

      <fieldset className="flex flex-col gap-2.5 w-full">
        <label className={cn("text-sm", labelClassName)}>
          {t(I18nKey.LLM$MODEL)}
        </label>
        <SectionedComboBox
          ariaLabel={t(I18nKey.LLM$MODEL)}
          inputValue={modelInputValue}
          isDisabled={isDisabled || !selectedProvider}
          isLoading={isLoadingModels}
          isRequired
          items={modelItems}
          onInputChange={setModelInputValue}
          onSelectionChange={(key) => {
            if (key?.toString()) {
              handleChangeModel(key.toString());
            }
          }}
          othersLabel={t(I18nKey.MODEL_SELECTOR$OTHERS)}
          placeholder={t(I18nKey.LLM$SELECT_MODEL_PLACEHOLDER)}
          selectedKey={selectedModel}
          testId="llm-model-input"
          verifiedLabel={t(I18nKey.MODEL_SELECTOR$VERIFIED)}
        />
        {modelsError && (
          <p className="text-danger text-xs" data-testid="models-error">
            {t(I18nKey.CONFIGURATION$ERROR_FETCH_MODELS)}
          </p>
        )}
      </fieldset>
    </div>
  );
}
